/**
 * Google Apps Script: Supabase sync from Sheets (paste into Extensions > Apps Script).
 *
 * Requires DB migrations:
 * - cleanup_stale_rows RPC: 20260324140000_add_cleanup_stale_rows_rpc.sql
 * - Fix (UUID case + sales_teams FK): 20260324150000_fix_cleanup_stale_rows_rpc.sql
 * - Large DELETE timeout: 20260324170000_cleanup_stale_rows_set_timeout.sql (SET LOCAL 60s)
 * - Faster cleanup + longer timeout: 20260326180000_optimize_cleanup_stale_rows_temp_table.sql (temp table + 300s)
 *
 * Details/Overview
 * - Hex / Sheets → Supabase for GTM dashboard
 * - Prefer Hex-native sync when possible: docs/hex-supabase-sync.py (direct Postgres).
 * - Stale-row cleanup: POST /rest/v1/rpc/cleanup_stale_rows (server compares ids as uuid, so
 *   uppercase IDs from Hex match lowercase DB ids).
 * - If superhex was ever emptied by an old RPC bug, run Sync Data once after the fix migration
 *   to re-upsert the Hex tab.
 * - metrics_sales_teams: rows still linked from project_team_assignments are never deleted
 *   (FK); other stale rows are removed as usual.
 * - If Sync Data hits the time limit, skipped tab names are stored on this spreadsheet
 *   (Document Properties). Run "Sync skipped tabs only (resume)" for a fresh execution
 *   (new Apps Script quota) that processes only those tabs.
 */

/**
 * Configuration
 * Replace these values with your specific Supabase project details.
 */
const SUPABASE_URL = 'https://fgshslmhxkdmowisrhon.supabase.co';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Map Google Sheet tab names → Supabase tables and primary keys.
// Optional batchSize per tab (default 2000). metrics_wins (500): set_win_stage_date trigger; metrics_ops (500): large-table upsert timeouts.
const SHEET_CONFIG = {
  'Hex': { tableName: 'superhex', uniqueKey: 'id' },
  'tam': { tableName: 'metrics_tam', uniqueKey: 'id' },
  'activity': { tableName: 'metrics_activity', uniqueKey: 'id' },
  'calls': { tableName: 'metrics_calls', uniqueKey: 'id' },
  'connects': { tableName: 'metrics_connects', uniqueKey: 'id' },
  'demos': { tableName: 'metrics_demos', uniqueKey: 'id' },
  'chorus': { tableName: 'metrics_chorus', uniqueKey: 'id' },
  'ops': { tableName: 'metrics_ops', uniqueKey: 'id', batchSize: 500 },
  'wins': { tableName: 'metrics_wins', uniqueKey: 'id', batchSize: 500 },
  'feedback': { tableName: 'metrics_feedback', uniqueKey: 'id' },
  'sales_teams': { tableName: 'metrics_sales_teams', uniqueKey: 'id' }
};

// --- CONFIGURATION END ---

var SKIPPED_TABS_PROPERTY_KEY = 'supabase_sync_skipped_tab_names';

function getSkippedTabsStore_() {
  var raw = PropertiesService.getDocumentProperties().getProperty(SKIPPED_TABS_PROPERTY_KEY);
  if (!raw) {
    return [];
  }
  try {
    var arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function setSkippedTabsStore_(names) {
  if (!names || names.length === 0) {
    clearSkippedTabsStore_();
    return;
  }
  PropertiesService.getDocumentProperties().setProperty(SKIPPED_TABS_PROPERTY_KEY, JSON.stringify(names));
}

function clearSkippedTabsStore_() {
  PropertiesService.getDocumentProperties().deleteProperty(SKIPPED_TABS_PROPERTY_KEY);
}

/**
 * Alert when a UI session exists (menu run); otherwise log + toast (time-driven triggers have no UI).
 */
function tryAlert_(title, body) {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.alert(title, body, ui.ButtonSet.OK);
  } catch (e) {
    Logger.log('[ALERT] ' + title + ': ' + body);
    SpreadsheetApp.getActiveSpreadsheet().toast(title, 'Supabase Sync', 15);
  }
}

/**
 * Sync one configured sheet (upsert + cleanup). Returns whether to increment successCount (same rules as syncData).
 */
function processConfiguredSheet_(sheet, sheetName, config, activeSpreadsheet, BATCH_SIZE, errors) {
  const tableName = config.tableName;
  const uniqueKeyColumn = config.uniqueKey;

  activeSpreadsheet.toast('Reading data from ' + sheetName + '...', 'Supabase Sync');
  Logger.log('--- Processing configured tab: ' + sheetName + ' ---');

  const dataRange = sheet.getDataRange();
  const data = dataRange.getValues();

  if (data.length <= 1) {
    Logger.log('Warning: No data rows found in "' + sheetName + '". Skipping.');
    return { addSuccessCount: false };
  }

  const headers = data[0];
  const rows = data.slice(1);

  const normalizedHeaders = headers.map(function (h) {
    return String(h).trim().toLowerCase();
  });
  const cleanUniqueKey = uniqueKeyColumn.toLowerCase();

  if (normalizedHeaders.indexOf(cleanUniqueKey) === -1) {
    const errorMsg = 'Header "' + uniqueKeyColumn + '" not found in tab "' + sheetName + '".';
    Logger.log(errorMsg);
    errors.push(errorMsg);
    return { addSuccessCount: false };
  }

  const payloadMap = new Map();

  rows.forEach(function (row) {
    const rowObject = {};
    let hasData = false;

    headers.forEach(function (header, index) {
      if (header && String(header).trim() !== '') {
        const cleanHeader = String(header).trim().toLowerCase();
        let cellValue = row[index];

        if (typeof cellValue === 'string') {
          const trimmedValue = cellValue.trim();
          if (trimmedValue === '') {
            cellValue = null;
          } else if (trimmedValue.endsWith('%')) {
            cellValue = parseFloat(trimmedValue.replace('%', ''));
          } else {
            cellValue = trimmedValue;
          }
        }

        rowObject[cleanHeader] = cellValue;
        hasData = true;
      }
    });

    if (hasData) {
      const rowId = rowObject[cleanUniqueKey];
      if (rowId !== undefined && rowId !== '' && rowId !== null) {
        payloadMap.set(rowId, rowObject);
      }
    }
  });

  const payload = Array.from(payloadMap.values());
  Logger.log('Extracted ' + rows.length + ' rows. Deduplicated to ' + payload.length + ' unique records.');

  const endpoint = SUPABASE_URL + '/rest/v1/' + tableName + '?on_conflict=' + uniqueKeyColumn;
  const baseOptions = {
    method: 'post',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    },
    muteHttpExceptions: true
  };

  activeSpreadsheet.toast('Batching and sending ' + sheetName + ' to ' + tableName + '...', 'Supabase Sync');

  let sheetHasErrors = false;

  const tabBatchSize = config.batchSize || BATCH_SIZE;
  for (let j = 0; j < payload.length; j += tabBatchSize) {
    const chunk = payload.slice(j, j + tabBatchSize);
    const options = Object.assign({}, baseOptions, { payload: JSON.stringify(chunk) });

    try {
      const response = fetchWithRetry(endpoint, options);
      const responseCode = response.getResponseCode();
      const responseText = response.getContentText();

      if (responseCode >= 200 && responseCode < 300) {
        Logger.log('Chunk Success: Synced rows ' + (j + 1) + ' to ' + (j + chunk.length) + ' for ' + sheetName + '.');
      } else {
        sheetHasErrors = true;
        const errorMsg =
          'Sync Failed for ' +
          sheetName +
          ' (Rows ' +
          (j + 1) +
          '-' +
          (j + chunk.length) +
          ') Code ' +
          responseCode +
          ': ' +
          responseText;
        Logger.log(errorMsg);
        errors.push(errorMsg);
      }
    } catch (e) {
      sheetHasErrors = true;
      const errorMsg =
        'Script Error on ' + sheetName + ' (Rows ' + (j + 1) + '-' + (j + chunk.length) + '): ' + e.message;
      Logger.log(errorMsg);
      errors.push(errorMsg);
    }
  }

  if (payload.length > 0) {
    Logger.log('Starting cleanup of stale data for ' + tableName + '...');
    activeSpreadsheet.toast('Cleaning up stale data in ' + tableName + '...', 'Supabase Sync');

    const validIds = Array.from(payloadMap.keys()).map(String);

    const rpcEndpoint = SUPABASE_URL + '/rest/v1/rpc/cleanup_stale_rows';
    const rpcOptions = {
      method: 'post',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({ p_table_name: tableName, p_valid_ids: validIds }),
      muteHttpExceptions: true
    };

    try {
      const rpcResponse = fetchWithRetry(rpcEndpoint, rpcOptions);
      const rpcCode = rpcResponse.getResponseCode();
      if (rpcCode >= 200 && rpcCode < 300) {
        const deletedCount = JSON.parse(rpcResponse.getContentText());
        Logger.log('Cleanup complete: deleted ' + deletedCount + ' stale rows from ' + tableName + '.');
      } else {
        const errMsg = 'Cleanup failed for ' + tableName + ' (' + rpcCode + '): ' + rpcResponse.getContentText();
        Logger.log(errMsg);
        errors.push(errMsg);
      }
    } catch (e) {
      const errMsg = 'Cleanup error for ' + tableName + ': ' + e.message;
      Logger.log(errMsg);
      errors.push(errMsg);
    }
  }

  if (!sheetHasErrors) {
    Logger.log('Successfully completed all batches and cleanup for ' + sheetName + '.');
  }

  return { addSuccessCount: !sheetHasErrors };
}

/**
 * Helper: Network request wrapper with Exponential Backoff
 */
function fetchWithRetry(url, options, maxRetries = 3) {
  let retries = 0;
  let delay = 1000;

  while (retries < maxRetries) {
    try {
      return UrlFetchApp.fetch(url, options);
    } catch (e) {
      const errorStr = e.message || String(e);
      if (errorStr.includes('Address unavailable') || errorStr.includes('Timeout')) {
        retries++;
        if (retries >= maxRetries) throw e;
        Logger.log('Network glitch (' + errorStr + '). Retrying ' + retries + '/' + maxRetries + ' in ' + delay + 'ms...');
        Utilities.sleep(delay);
        delay *= 2;
      } else {
        throw e;
      }
    }
  }
}

/**
 * Menu
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Supabase Sync')
    .addItem('Sync Data', 'syncData')
    .addItem('Sync skipped tabs only (resume)', 'syncSkippedOnly')
    .addToUi();
}

/**
 * Main Function - Iterates through all tabs
 */
function syncData() {
  const START_TIME = Date.now();
  // Google Workspace hard limit is 30 min; 28 min leaves a safe buffer for all tabs on slow network days.
  const MAX_EXECUTION_TIME_MS = 28 * 60 * 1000;

  Logger.log('--- Starting Full Batch Upsert & Cleanup Process ---');

  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = activeSpreadsheet.getSheets();

  let successCount = 0;
  const errors = [];
  const skippedTabs = [];

  const BATCH_SIZE = 2000;

  for (let i = 0; i < sheets.length; i++) {
    if (Date.now() - START_TIME > MAX_EXECUTION_TIME_MS) {
      for (let k = i; k < sheets.length; k++) {
        const nm = sheets[k].getName();
        if (SHEET_CONFIG[nm]) {
          skippedTabs.push(nm);
        }
      }
      break;
    }

    const sheet = sheets[i];
    const sheetName = sheet.getName();

    const config = SHEET_CONFIG[sheetName];
    if (!config) {
      Logger.log('Skipping "' + sheetName + '" - not in config.');
      continue;
    }

    const result = processConfiguredSheet_(sheet, sheetName, config, activeSpreadsheet, BATCH_SIZE, errors);
    if (result.addSuccessCount) {
      successCount++;
    }
  }

  Logger.log('--- Process Finished ---');

  if (skippedTabs.length > 0) {
    setSkippedTabsStore_(skippedTabs);
  } else {
    clearSkippedTabsStore_();
  }

  if (skippedTabs.length > 0) {
    tryAlert_(
      'Execution Paused: Time Limit Reached',
      'Synced ' +
        successCount +
        ' tabs safely, but stopped to prevent a crash.\n\nSkipped tabs:\n- ' +
        skippedTabs.join('\n- ') +
        '\n\nRun Supabase Sync → Sync skipped tabs only (resume) to continue in a new run.' +
        (errors.length > 0 ? '\n\nErrors:\n- ' + errors.join('\n- ') : '')
    );
  } else if (errors.length > 0) {
    tryAlert_(
      'Sync Completed with Errors',
      'Successfully synced ' + successCount + ' tabs.\n\nErrors encountered:\n- ' + errors.join('\n- ')
    );
  } else {
    activeSpreadsheet.toast(
      'All ' + successCount + ' configured tabs were successfully synced and cleaned up in Supabase!',
      'Sync Complete',
      10
    );
  }
}

/**
 * Second run: process only tabs saved when Sync Data hit MAX_EXECUTION_TIME_MS.
 * Each Apps Script execution gets its own time budget (e.g. 6 min consumer / 30 min Workspace).
 */
function syncSkippedOnly() {
  const START_TIME = Date.now();
  const MAX_EXECUTION_TIME_MS = 28 * 60 * 1000;

  const pendingNames = getSkippedTabsStore_();
  if (pendingNames.length === 0) {
    tryAlert_(
      'No skipped tabs',
      'Nothing is queued. If a full sync stops early for time, skipped tab names are saved automatically; run this menu item again after that.'
    );
    return;
  }

  Logger.log('--- Resume: skipped tabs only (' + pendingNames.length + ') ---');

  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let successCount = 0;
  const errors = [];
  const BATCH_SIZE = 2000;
  const remaining = [];

  for (let i = 0; i < pendingNames.length; i++) {
    if (Date.now() - START_TIME > MAX_EXECUTION_TIME_MS) {
      for (let k = i; k < pendingNames.length; k++) {
        remaining.push(pendingNames[k]);
      }
      break;
    }

    const sheetName = pendingNames[i];
    const sheet = activeSpreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      errors.push('Sheet not found (rename?): ' + sheetName);
      continue;
    }

    const config = SHEET_CONFIG[sheetName];
    if (!config) {
      errors.push('Tab "' + sheetName + '" is not in SHEET_CONFIG.');
      continue;
    }

    const result = processConfiguredSheet_(sheet, sheetName, config, activeSpreadsheet, BATCH_SIZE, errors);
    if (result.addSuccessCount) {
      successCount++;
    }
  }

  if (remaining.length > 0) {
    setSkippedTabsStore_(remaining);
  } else {
    clearSkippedTabsStore_();
  }

  Logger.log('--- Resume run finished ---');

  if (remaining.length > 0) {
    tryAlert_(
      'Resume paused: time limit',
      'Synced ' +
        successCount +
        ' of ' +
        pendingNames.length +
        ' queued tabs.\n\nStill pending:\n- ' +
        remaining.join('\n- ') +
        '\n\nRun Sync skipped tabs only (resume) again.' +
        (errors.length > 0 ? '\n\nErrors:\n- ' + errors.join('\n- ') : '')
    );
  } else if (errors.length > 0) {
    tryAlert_(
      'Resume finished with errors',
      'Processed queued tabs with issues.\n\nErrors:\n- ' + errors.join('\n- ')
    );
  } else {
    activeSpreadsheet.toast(
      'Resume complete: ' + successCount + ' tab(s) synced.',
      'Supabase Sync',
      10
    );
  }
}
