import { Link } from "react-router-dom";

export default function Help() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-10 text-foreground">
      <h1 className="text-3xl font-bold mb-2">How to Use GTMx Pilots</h1>
      <p className="text-muted-foreground mb-8">
        A complete guide for managers and reps covering every feature of the platform.
      </p>

      {/* ---- 1. Getting Started ---- */}
      <Section id="getting-started" title="1. Getting Started">
        <p>
          GTMx Pilots is a dashboard for managing sales pilot teams. It lets you
          track weekly funnel metrics, set monthly goals, calculate quota
          attainment, and monitor real-time activity data, all in one place.
        </p>

        <H3>Navigating the App</H3>
        <ul className="list-disc pl-5 space-y-1">
          <li>The <strong>sticky navigation bar</strong> at the top of every page starts with a <Link to="/home" className="text-primary underline"><strong>Home</strong></Link> link (house icon), followed by each active team, <Link to="/data" className="text-primary underline">Data &amp; Findings</Link>, <Link to="/quota" className="text-primary underline">Quota</Link>, <Link to="/roadmap" className="text-primary underline">Roadmap</Link>, <Link to="/settings" className="text-primary underline">Settings</Link>, and <Link to="/help" className="text-primary underline">Help</Link>.</li>
          <li>Click any <strong>team name</strong> in the nav to jump directly to that pilot's dashboard.</li>
          <li>The <Link to="/help" className="text-primary underline"><strong>Help</strong></Link> link (question-mark icon) and <Link to="/settings" className="text-primary underline"><strong>Settings</strong></Link> link (gear icon) are on the far right, next to the theme toggle.</li>
        </ul>

        <H3>Home Page</H3>
        <p>
          The <Link to="/home" className="text-primary underline">Home</Link> page
          is the app's landing page. It's the first thing you see when you open
          GTMx Pilots.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Active Projects</strong>: one card per active team showing the
            team name, owner, lead rep, member count, date range, a time-elapsed
            progress bar with business days remaining, and lifetime stat tiles
            (Ops, Demos, Wins, Feedback, Activity). Click any card to jump to that
            project's dashboard.
          </li>
          <li>
            <strong>Explore</strong>: overview cards describing what to expect on
            each page: a "Project Pages" tile summarizing all project dashboards,
            plus clickable tiles for{" "}
            <Link to="/data" className="text-primary underline">Data &amp; Findings</Link> and{" "}
            <Link to="/quota" className="text-primary underline">Quota</Link> with
            bullet-point descriptions.
          </li>
        </ul>

        <H3>Dark Mode</H3>
        <p>
          Click the sun/moon icon in the navigation bar to toggle between light
          mode, dark mode, and your system default.
        </p>
      </Section>

      {/* ---- 2. Settings ---- */}
      <Section id="settings" title="2. Settings: Managing Teams &amp; Members">
        <p>
          The{" "}
          <Link to="/settings" className="text-primary underline">
            Settings
          </Link>{" "}
          page is where you configure teams and members. All changes here
          propagate automatically to the <Link to="/Pilots" className="text-primary underline">Pilots</Link>, <Link to="/quota" className="text-primary underline">Quota</Link>, and <Link to="/data" className="text-primary underline">Data</Link> pages.
        </p>

        <H3>Creating a Team</H3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Click <strong>"New Team"</strong> and enter a name and owner.</li>
          <li>Pick a <strong>Start Date</strong>. The End Date auto-fills to 9 months later but can be adjusted.</li>
          <li>The team will appear in the nav bar and on the <Link to="/Pilots" className="text-primary underline">Pilots</Link> page once created.</li>
        </ul>

        <H3>Reordering Teams</H3>
        <p>
          Drag the <strong>grip handle</strong> (vertical dots icon) on any team
          card to reorder. The new order is reflected in the navigation bar and
          everywhere teams are listed.
        </p>

        <H3>Activating / Deactivating a Team</H3>
        <p>
          Use the <strong>toggle switch</strong> on a team card to make it
          inactive. Inactive teams are hidden from the nav bar and <Link to="/Pilots" className="text-primary underline">Pilots</Link> page
          but retain all data. Toggle it back on at any time.
        </p>

        <H3>Archiving (Deleting) a Team</H3>
        <p>
          Click the delete button on a team card. A confirmation dialog will
          appear. Archiving is a <strong>soft delete</strong>: all historical
          data is preserved. Members are moved to the unassigned pool.
        </p>

        <H3>Editing a Team</H3>
        <p>Click the <strong>pencil icon</strong> on any team card to open the Edit Team modal. From here you can change:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Name, Owner, Lead Rep, Start/End Dates</strong></li>
          <li>
            <strong>Test Phases Month Selector</strong>: a visual month-selector
            bar (matching the test phases bar on project pages) appears between
            the date fields and Monthly Goals. Click any month to load that
            month's goals and accelerators into the form. A "Viewing: [Month
            Year]" banner appears with a "Back to Current" link when viewing a
            non-current month. Saving while viewing a past or future month writes
            only to that month's historical record; saving on the current month
            updates the live team configuration.
          </li>
          <li>
            <strong>Team Members</strong>: below the month selector, a "Team
            Members" section shows the roster for the selected month with a member
            count badge. Each row displays the member's name, level badge, and a
            remove button. An "Add Member" dropdown lets you add any active member
            not currently on the roster. When viewing a historical month, changes
            to the roster update the historical record, so you can retroactively
            correct a late join, backfill a transfer, or remove a member who
            wasn't actually on the team that month.
          </li>
          <li>
            <strong>Monthly Goals</strong>: toggle individual metrics on or off,
            set per-level targets (ADR, BDR, Rep, Senior, Principal, Lead), and
            enable Parity mode to auto-split team goals across members.
          </li>
          <li>
            <strong>Goal Scope (Self vs Team)</strong>: for each metric, choose
            whether the goal is measured per individual rep or as a summed team
            total.
          </li>
          <li>
            <strong>Accelerators</strong>: define stackable IF/THEN rules that
            modify quota. For example: "IF Calls &gt; 600 THEN +10% to Quota."
            Each rule has its own condition, effect, and Self/Team scope.
          </li>
        </ul>
        <p>The <strong>Save Changes</strong> button stays pinned at the bottom of the modal so you can save from any scroll position.</p>

        <H3>Managing Members</H3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Add a member</strong> by clicking "New Member", then enter a name and optionally set their level.</li>
          <li><strong>Edit inline</strong>: click a member's name or level in the table to edit in place. A pencil icon appears on hover.</li>
          <li><strong>Remove a member</strong>: this archives them (soft delete). Their funnel data and win stories remain on the team for historical reporting.</li>
          <li><strong>Move a member</strong> between teams. The member's team assignment is updated in place so all historical data follows them. A history record tracks which teams they've been on and when, ensuring past months show the correct roster on each team.</li>
        </ul>
      </Section>

      {/* ---- 3. Pilots Page ---- */}
      <Section id="pilots" title="3. Pilots Page: The Main Dashboard">
        <p>
          The{" "}
          <Link to="/Pilots" className="text-primary underline">
            Pilots
          </Link>{" "}
          page is the heart of the app. Each team gets its own tab with four
          collapsible sections: <strong>Summary</strong>,{" "}
          <strong>Monthly Data</strong>, <strong>Weekly Data</strong>, and{" "}
          <strong>Rep Self-Overrides</strong>.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Switch teams</strong> by clicking tabs at the top or using the nav bar links.</li>
          <li><strong>Collapse/expand sections</strong> by clicking any section header. A chevron icon indicates the current state.</li>
          <li><strong>Collapse state persists</strong> across page refreshes and browser restarts. Collapsing a section on one pilot collapses it on all pilots automatically.</li>
          <li>Large numbers throughout the page display with <strong>thousands separators</strong> for easier scanning.</li>
        </ul>

        <H3 id="manager-inputs">3a. Summary</H3>

        <H4>Test Phases</H4>
        <ul className="list-disc pl-5 space-y-1">
          <li>Phases are <strong>auto-generated</strong> from the team's start and end dates, with one phase per calendar month.</li>
          <li>The progress bar fills automatically: past months show 100%, the current month shows proportional progress, future months show 0%.</li>
          <li>Below each month, a <strong>wins label</strong> shows the total wins for that month. When a wins goal is configured, the label displays as "X / Y wins" (actual vs. goal); otherwise it shows "X wins" (total only).</li>
          <li>Click the <strong>phase label</strong> to edit its description. Labels support <strong>multi-line text</strong>: the field auto-expands as you type so longer notes and paragraphs are always fully visible.</li>
          <li>
            <strong>Collapsible buckets:</strong> When a test spans many months,
            older months are grouped into a "Prev (N)" bucket on the left and
            future months into a "Next (N)" bucket on the right. Click either
            bucket to expand and see all individual months; click "Collapse" to
            re-collapse. The current month and two prior months are always
            visible by default.
          </li>
          <li>
            <strong>Dynamic re-centering:</strong> When you click a different
            month, the visible window re-centers around the selected month
            (showing it plus up to 2 prior months) and collapses everything
            else back into "Prev" / "Next" buckets. This keeps the display
            compact regardless of which month you navigate to.
          </li>
          <li>Click <strong>"Extend the Test"</strong> to add one month to the team's end date.</li>
          <li>If no dates are set, you'll see a link to <Link to="/settings" className="text-primary underline">Settings</Link> to configure them.</li>
        </ul>

        <H4>Month Look-Back</H4>
        <p>
          Click any <strong>month segment</strong> in the test phases bar to view
          that month's historical data across the entire page. A banner shows
          which month you're viewing with a <strong>"Back to Current"</strong>{" "}
          link to return. Historical views are fully accurate:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Roster accuracy:</strong> Past months show the members who
            were actually on the team during that period. If someone moved to
            another project, they still appear on their old team for the months
            they were there, and TAM/member counts adjust accordingly.
          </li>
          <li>
            <strong>Goal &amp; accelerator accuracy:</strong> Goals, enabled
            metrics, accelerator rules, parity settings, and per-level targets
            are all snapshotted each time they change. Viewing a past month shows
            the configuration that was in effect during that period, not the
            current configuration.
          </li>
        </ul>

        <H4>Mission &amp; Purpose</H4>
        <p>
          A structured section where managers capture key details about the
          project's test. Each project has its own independent values;
          editing one pilot does not affect any other. Fields include:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Revenue Lever:</strong> The primary revenue lever being targeted.</li>
          <li><strong>Business Goal:</strong> The business outcome the test aims to achieve.</li>
          <li><strong>What We Are Testing:</strong> A description of the hypothesis or approach under test.</li>
          <li><strong>Executive Sponsor:</strong> The executive sponsor overseeing the test.</li>
          <li><strong>Executive Proxy:</strong> The executive proxy supporting the test.</li>
          <li><strong>Mission Statement:</strong> A free-text field for additional mission context.</li>
        </ul>
        <p>
          Click <strong>Submit</strong> to save. Once submitted, values display
          as read-only text with a <strong>"last edit: mm/dd/yy"</strong>{" "}
          timestamp showing when the mission details were last saved. Click{" "}
          <strong>Edit</strong> to unlock and modify.
        </p>

        <H4>Lifetime Stats</H4>
        <p>
          An orange-bordered card showing cumulative performance across the{" "}
          <strong>entire test duration</strong>, regardless of which month is
          selected. Includes conversion funnels (Touch Rate, Call→Connect,
          Connect→Demo, Demo→Win) and stat totals (Ops, Demos, Wins, Feedback,
          Activity).
        </p>

        <H4>Total TAM</H4>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>When external metrics data exists:</strong> Total TAM,
            Touched Accounts, Avg TAM, and Touch Rate are displayed as read-only
            stats sourced from the metrics system.
          </li>
          <li>
            <strong>When no external data exists (manual fallback):</strong>{" "}
            Enter a Total TAM value and click <strong>Submit</strong>. The value
            is divided equally across active members and persisted to each
            member's weekly funnel. Touched Accounts, Avg TAM, and Touch Rate
            are computed and displayed alongside the editable Total TAM. Click{" "}
            <strong>Edit</strong> to change it. The new value applies from the
            current week forward while older weeks retain their original value.
          </li>
        </ul>

        <H3 id="test-signals">3b. Monthly Data</H3>

        <H4>Monthly Stats</H4>
        <ul className="list-disc pl-5 space-y-1">
          <li>A blue-bordered card showing current-month totals for Ops, Demos, Wins, Feedback, and Activity, with a badge indicating the selected month (e.g. "Mar 2026").</li>
          <li>The <strong>Total Wins</strong> card always displays an upward-trending green arrow to reinforce positive momentum.</li>
          <li>
            <strong>Monthly Conversion Rates</strong> (Call→Connect, Connect→Demo,
            Demo→Win) are scoped to the selected month, matching all other stats
            on the page, and they no longer mix data across month boundaries.
          </li>
        </ul>

        <H4>Monthly Goals</H4>
        <ul className="list-disc pl-5 space-y-1">
          <li>Displays a read-only table of each enabled metric with the member's current value, goal target, progress bar, and percentage.</li>
          <li>The <strong>Wins column always appears</strong> as the rightmost column, even when no wins goal is configured. Without a goal, the cell shows only the raw count (e.g. "4"); with a goal, it renders the full actual/goal, progress bar, and percentage like other metrics.</li>
          <li>When a metric's goal is <strong>zero</strong> (not configured for the member's role in the current month), the cell shows only the raw count instead of "actual / 0" with an empty progress bar.</li>
          <li>Percentages are uncapped: values above 100% turn green to indicate the goal has been exceeded.</li>
          <li>Active and former members are shown in separate groups.</li>
          <li>When viewing a past month, goals and enabled metrics reflect the configuration that was in effect at that time.</li>
          <li>Goals are configured in <Link to="/settings" className="text-primary underline">Settings</Link>, not on this page.</li>
        </ul>

        <H4>Funnel Overview &amp; Player Selection</H4>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            The <strong>Funnel Overview</strong> chart shows week-over-week
            trends. Toggle metrics on/off using the buttons above the chart.
            Hover over any data point to see values and each member's role that
            week.
          </li>
          <li>
            <strong>SELECT PLAYERS</strong> buttons below the chart let you
            filter the chart to specific members. Conversion rate averages are
            calculated across all weeks that have data.
          </li>
        </ul>

        <H3 id="weekly-data">3c. Weekly Data</H3>
        <ul className="list-disc pl-5 space-y-1">
          <li>A comprehensive grid showing every metric per member per week, starting from the team's start date through the current week.</li>
          <li>Columns are <strong>Monday-aligned</strong>. The most recent weeks are visible first; scroll left to see older weeks.</li>
          <li>
            <strong>Monthly summary columns</strong> are interleaved after the
            last week of each calendar month. TAM shows the carried value from
            the last week; all other metrics show the sum across that month's
            weeks. Monthly columns are visually distinguished with a muted
            background and bold header (JAN, FEB, MAR, etc.).
          </li>
          <li><strong>Player</strong> and <strong>Metric</strong> columns are frozen on the left; <strong>Total</strong> is frozen on the right. The Total column sums only the weekly values (monthly summary columns are not double-counted).</li>
          <li>The <strong>Activity</strong> row is always visible directly below TAM, regardless of whether the activity goal is enabled in team settings.</li>
          <li>TAM values <strong>carry forward</strong>: once set, TAM persists in future weeks until a new value is submitted.</li>
          <li>Conversion rate rows (Touch Rate, Call-to-Connect, Connect-to-Demo, Demo-to-Win) are included below the metric rows.</li>
          <li>
            Below a thick separator line, the <strong>Team Monthly Aggregate</strong>{" "}
            section shows summed team totals grouped by calendar month, with
            uniform column widths for consistent alignment across all months.
          </li>
        </ul>

        <H3 id="players-section">3d. Rep Self-Overrides</H3>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Week Selector:</strong> A dropdown in the section header lets
            reps choose any week within the team's date range. The current week
            is labeled "(current)" and selected by default. All reads, writes,
            and submissions in this section operate on the selected week.
          </li>
          <li>
            <strong>Your Funnels:</strong> Each active member has a weekly input
            form with fields for Activity, Calls, Connects, Ops, Demos, Wins,
            and Feedback, plus a role dropdown (TOFU, Closing, etc.). Any value
            entered here will completely overwrite the value from the report for
            that metric and week.
          </li>
          <li>
            <strong>Submit &amp; Edit Submission:</strong> Once funnels are
            submitted for a week, they are locked. Past weeks that were never
            submitted are also locked by default to prevent silent changes to
            historical data. To re-open any locked week, click{" "}
            <strong>Edit Submission</strong>. A confirmation dialog will ask
            for your name. This is logged to an audit trail so managers can see
            who unlocked the week and when.
          </li>
          <li>
            <strong>Win Stories:</strong> Record wins with a restaurant name,
            story, and date. A duck is earned for every 3 wins.
          </li>
          <li>Data should be updated weekly by <strong>Tuesday 12pm EST</strong>.</li>
        </ul>
      </Section>

      {/* ---- 4. Quota ---- */}
      <Section id="quota" title="4. Quota Page">
        <p>
          The{" "}
          <Link to="/quota" className="text-primary underline">
            Quota
          </Link>{" "}
          page shows goal attainment and quota calculations for every active
          team.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>A <strong>month timeline</strong> at the top merges all active teams' date ranges. Click any month to view historical data.</li>
          <li>Each team has its own <strong>card</strong> with a row per member.</li>
          <li>
            For each enabled metric, you'll see the <strong>current value</strong>,{" "}
            <strong>goal</strong>, a progress bar, <strong>"needed"</strong>{" "}
            count (remaining to hit the goal), and <strong>"per day"</strong>{" "}
            pace (what's needed per business day).
          </li>
          <li>
            The <strong>Quota %</strong> is the average completion across all
            enabled metrics, modified by any triggered accelerators. It's capped
            at 200% and turns green when above 100%.
          </li>
          <li>
            <strong>Hover over the quota percentage</strong> for a full
            breakdown: each metric's ratio, the base average, each accelerator
            step (with before/after values), and the final quota.
          </li>
          <li>
            <strong>Accelerator lock icons</strong> appear next to the quota.
            Unlocked icons mean the rule was triggered. Hover for details:
            which metric triggered it, the current value vs. the condition
            threshold, and the effect on quota.
          </li>
          <li>
            <strong>Goal scope indicators:</strong> Column headers show
            "(team)" for team-scoped metrics. Cells display a "Team" badge when
            showing summed values. Accelerator breakdown tooltips show
            "TM" (team) or "SF" (self) badges.
          </li>
          <li>
            <strong>Historical accuracy:</strong> Viewing a past month uses the
            goals, accelerators, and roster that were in effect during that
            period, so quota calculations are always correct for the time frame
            you're looking at.
          </li>
        </ul>
      </Section>

      {/* ---- 5. Roadmap ---- */}
      <Section id="roadmap" title="5. Roadmap Page">
        <p>
          The{" "}
          <Link to="/roadmap" className="text-primary underline">
            Roadmap
          </Link>{" "}
          page provides a forward-looking calendar view of all non-archived
          projects with team member assignments and availability forecasting.
        </p>

        <H4>Calendar Grid</H4>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            A <strong>6-month sliding calendar</strong> showing the current month
            plus 5 months forward. Navigate with <strong>left/right arrows</strong>{" "}
            or click <strong>"Today"</strong> to reset to the current window.
          </li>
          <li>
            Each month column displays <strong>project cards</strong> for every
            non-archived project active during that month, with a colored left
            border for visual grouping.
          </li>
          <li>
            Projects occupy a <strong>fixed row</strong> across all months, so
            the same project always appears at the same vertical position
            regardless of whether other projects start or end in a given month.
          </li>
          <li>
            Project cards show the project name (clickable, links to the Pilots
            page), the <strong>phase label</strong> for that month,{" "}
            <strong>"Starts"/"Ends" badges</strong> on the first and last months,
            and <strong>member avatar initials</strong> with tooltips.
          </li>
          <li>
            <strong>Inactive projects</strong> (non-archived but toggled off)
            appear at 60% opacity with an "Inactive" badge to distinguish them
            from active projects.
          </li>
        </ul>

        <H4>Capacity Summary</H4>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            A summary bar at the top shows <strong>active members</strong>{" "}
            (currently assigned to a project), <strong>available members</strong>{" "}
            (not on any active project), and <strong>total headcount</strong>.
          </li>
        </ul>

        <H4>Team Availability</H4>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            A section at the bottom lists <strong>currently available</strong>{" "}
            members and groups <strong>upcoming availability</strong> by the
            month each member's current project ends, so you can plan staffing
            for future projects.
          </li>
        </ul>
      </Section>

      {/* ---- 6. Data & Findings ---- */}
      <Section id="data" title="6. Data &amp; Findings Page">
        <p>
          The{" "}
          <Link to="/data" className="text-primary underline">
            Data &amp; Findings
          </Link>{" "}
          page provides deal-cycle analytics, revenue impact tracking, and a
          filterable metrics explorer, all derived from the underlying metrics
          event data.
        </p>

        <H4>Deal Averages</H4>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            A collapsible section displaying 6 stat cards: <strong>Deal
            Cycle Avg</strong> (first call → win), <strong>Avg
            Call→Connect</strong>, <strong>Avg Connect→Demo</strong>,{" "}
            <strong>Avg Demo→Win</strong>, <strong>Avg
            Activities/Demo</strong>, and <strong>Avg
            Activities/Win</strong>. Each card shows the computed average and
            sample size.
          </li>
          <li>
            A <strong>project filter</strong> dropdown scopes the stats to All
            Projects or a single team.
          </li>
          <li>
            Reps are mapped to projects using the member team history date
            windows, so the averages reflect the correct team for each data
            point.
          </li>
        </ul>

        <H4>RevX Impact</H4>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            A collapsible section that quantifies total revenue impact across
            all projects. One card per project (where wins &gt; 0) shows the
            project name, a wins badge, and an inline editable{" "}
            <strong>"$ / win"</strong> input.
          </li>
          <li>
            Once a value is entered, a <strong>Total Impact</strong> chip
            appears on the card (wins × value per win), and a{" "}
            <strong>Total RevX Impact</strong> summary bar appears at the
            bottom summing all projects.
          </li>
          <li>
            Values are saved optimistically to localStorage and durably
            persisted to Supabase on blur or Enter.
          </li>
        </ul>

        <H4>Test Data Selections</H4>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            A collapsible section with a filterable metrics explorer for
            exploring raw event data (Activity, Calls, Connects, Demos, Wins,
            Ops, Feedback).
          </li>
          <li>
            <strong>Time</strong> filter: choose a specific month or week
            derived from team start/end dates.
          </li>
          <li>
            <strong>Data</strong> filter: multi-select which metric types to
            include.
          </li>
          <li>
            <strong>Detail</strong> toggle: switch between a{" "}
            <strong>Summary</strong> view (one row per rep with count columns)
            and a <strong>Detailed</strong> view (individual event rows with
            Account Name, Date, Type, Rep, and Details).
          </li>
          <li>
            <strong>Team Only</strong> toggle: filter results to only include
            rows where the rep is a known team member.
          </li>
          <li>
            A <strong>CSV download</strong> icon in the section header exports
            the current table view.
          </li>
        </ul>
      </Section>

      {/* ---- 7. Real-Time Data ---- */}
      <Section id="realtime" title="7. Real-Time Data">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Activity data from external metrics tables (calls, connects,
            demos, ops, wins, feedback, activity) syncs in{" "}
            <strong>real time</strong>. When new data is inserted or updated,
            the app refreshes automatically; no manual page reload needed.
          </li>
          <li>
            External event data is aggregated into weekly totals and provides
            the <strong>baseline</strong>. Any non-zero value entered manually
            in Rep Self-Overrides will override the external value for that
            metric and week.
          </li>
          <li>
            <strong>Ops are counted by creation date</strong>, not close date.
            An opportunity appears in the week and month it was created, giving
            an accurate picture of pipeline generation timing.
          </li>
          <li>
            <strong>Calendar-month attribution:</strong> Monthly totals are
            calculated using actual calendar-month boundaries. Events are
            attributed to the month their date falls in, avoiding
            misattribution near month boundaries that can occur with
            week-based bucketing.
          </li>
        </ul>
      </Section>

      {/* ---- 8. Tips ---- */}
      <Section id="tips" title="8. Tips &amp; Shortcuts">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Hover over the quota %</strong> on the <Link to="/quota" className="text-primary underline">Quota</Link> page for a
            complete calculation breakdown.
          </li>
          <li>
            <strong>Hover over accelerator lock icons</strong> to see exactly
            which rule triggered and its effect.
          </li>
          <li>
            <strong>Former members</strong> remain visible in read-only mode
            throughout the app. Their historical data is never lost, even when
            they move between projects.
          </li>
          <li>
            <strong>Collapse sections</strong> you aren't using to reduce
            scrolling on the <Link to="/Pilots" className="text-primary underline">Pilots</Link> page. Your preference is saved automatically
            and shared across all pilots.
          </li>
          <li>
            <strong>Use the week selector</strong> in Rep Self-Overrides to go
            back and update a prior week's funnel data.
          </li>
          <li>
            <strong>Look back in time</strong>: click any past month in the
            test phases bar to see historical data with the correct roster,
            goals, and accelerators.
          </li>
          <li>
            <strong>Start from <Link to="/home" className="text-primary underline">Home</Link></strong>:{" "}
            the Home page gives you a bird's-eye view of all active projects
            with lifetime stats and quick links to every section of the app.
          </li>
          <li>
            <strong>Edit past months</strong>: in the Edit Team modal on{" "}
            <Link to="/settings" className="text-primary underline">Settings</Link>,
            use the month selector to retroactively adjust goals, accelerators,
            and team rosters for any month in the test period.
          </li>
          <li>
            <strong>Check wins per phase</strong>: the wins label below each
            test phase month gives you an at-a-glance view of outcome
            performance without opening Monthly Goals.
          </li>
          <li>
            <strong>Plan ahead with <Link to="/roadmap" className="text-primary underline">Roadmap</Link></strong>:{" "}
            use the 6-month calendar view to see which projects overlap, who's
            assigned where, and when team members become available for new work.
          </li>
          <li>
            <strong>Dark mode</strong> adapts all charts, cards, and text for
            comfortable viewing in low-light environments.
          </li>
        </ul>
      </Section>

      {/* ---- 9. Metric Definitions ---- */}
      <Section id="metric-definitions" title="9. Metric Definitions">
        <p>
          Below are the definitions for each core metric tracked in GTMx Pilots,
          including where the data comes from and how it's aggregated.
        </p>

        <H3>TAM (Total Addressable Market)</H3>
        <p>
          The total number of addressable accounts assigned to a rep or team.
          When external TAM data exists (from the metrics system), each rep's TAM
          is the sum of their assigned account records. When no external data is
          available, a manager enters a Total TAM value that is divided equally
          across active members. TAM is a <strong>snapshot</strong>, not a
          cumulative metric: once set for a week, it carries forward automatically
          until a new value is submitted. Monthly summaries use the last week's
          carried TAM value. Touch Rate is derived from TAM as{" "}
          <em>Touched Accounts / TAM</em>.
        </p>
        <ul className="list-disc !pl-14 space-y-1">
          <li>
            <strong>Technical Details:</strong> Sourced from{" "}
            <code>all_gtmx_tam</code>. Static count of distinct accounts per
            rep. Mad Max accounts from <code>google_sheet_mad_max</code> grouped
            by GTMx rep, Sterno accounts from <code>google_sheet_sterno</code>{" "}
            grouped by account owner, plus a hardcoded 2,400 for Lo Picton
            (Guest Pro). Excludes DNQ/mid-market/enterprise statuses (Mad Max)
            and disqualified outcomes (Sterno).
          </li>
        </ul>

        <H3>Activity</H3>
        <p>
          Any individual outreach action performed by a rep, such as emails,
          social touches, or other non-call engagement. Each row in the activity
          data source counts as <strong>1 activity</strong>. Activities are
          attributed to the week and month of the activity date. Weekly totals
          are summed into monthly and lifetime aggregates.
        </p>
        <ul className="list-disc !pl-14 space-y-1">
          <li>
            <strong>Technical Details:</strong> Sourced from{" "}
            <code>all_gtmx_activity</code>. All tasks and events owned by reps
            on Bridget's team (manager_employee_id = '108763') since
            2025-07-01. Two branches: TASK_ACTIVITY (by task_ownerid) and
            GTM.EVENT (by event_owner_userid), both joined to
            EMPLOYEE_CURRENT.
          </li>
        </ul>

        <H3>Call</H3>
        <p>
          A phone call or equivalent direct outreach attempt made by a rep. Each
          row in the calls data source counts as <strong>1 call</strong>. Calls
          are attributed by call date and feed into the{" "}
          <em>Call → Connect</em> conversion rate.
        </p>
        <ul className="list-disc !pl-14 space-y-1">
          <li>
            <strong>Technical Details:</strong> Sourced from{" "}
            <code>all_gtmx_calls</code>. Subset of{" "}
            <code>all_gtmx_activity</code> where{" "}
            <code>activity_type ILIKE '%call%'</code>.
          </li>
        </ul>

        <H3>Connect</H3>
        <p>
          A successful live conversation with a prospect resulting from a call or
          outreach. Each row in the connects data source counts as{" "}
          <strong>1 connect</strong>. Connects are attributed by connect date and
          feed into both the <em>Call → Connect</em> and{" "}
          <em>Connect → Demo</em> conversion rates.
        </p>
        <ul className="list-disc !pl-14 space-y-1">
          <li>
            <strong>Technical Details:</strong> Sourced from{" "}
            <code>all_gtmx_connects</code>. Subset of{" "}
            <code>all_gtmx_activity</code> where{" "}
            <code>activity_type ILIKE '%call%'</code> AND{" "}
            <code>activity_outcome ILIKE '%connect%'</code>.
          </li>
        </ul>

        <H3>Demo</H3>
        <p>
          A product demonstration or qualified meeting held with a prospect. Each
          row in the demos data source counts as <strong>1 demo</strong>. Demos
          are attributed by demo date and feed into the{" "}
          <em>Connect → Demo</em> and <em>Demo → Win</em> conversion rates.
        </p>
        <ul className="list-disc !pl-14 space-y-1">
          <li>
            <strong>Technical Details:</strong> Sourced from{" "}
            <code>all_gtmx_demos</code>. 9 UNION branches from GTM.EVENT and
            TASK_ACTIVITY, filtered to Bridget's team via an activity_users
            CTE. Includes: completed events with type = Demo, subject = Demo,
            task calls with subject containing "demo," Shane's "Toast Boost"
            events, Carly's "Meeting Booked: Toast Exclusive Offers Demo"
            events, Zoe's "marketing test" tasks, events where the owner also
            owns an opp on the same account, and events with{" "}
            <code>meeting_type ILIKE '%gtmx%'</code>. All joined to
            ANALYTICS_CORE.ACCOUNT for account names.
          </li>
        </ul>

        <H3>Ops (Opportunities)</H3>
        <p>
          A sales opportunity created in the pipeline. Each row in the
          opportunities data source counts as <strong>1 op</strong>.
          Opportunities are attributed by <strong>creation date</strong>, not
          close date, so they appear in the week and month the opportunity was
          first generated. This gives an accurate picture of pipeline generation
          timing.
        </p>
        <ul className="list-disc !pl-14 space-y-1">
          <li>
            <strong>Technical Details:</strong> Sourced from{" "}
            <code>all_gtmx_ops</code>. 4 UNION branches from GTM.OPPORTUNITY:
            opp name contains #GTMX (clause 1), #Guestpro with rep hardcoded
            to Lo Picton (clause 2), opp owner on Bridget's team since
            2025-09-01 (clause 3), or account has 2025CateringTest in
            prospecting notes with specific date/type/owner filters (clause 4).
            Deduplicated with SELECT DISTINCT.
          </li>
        </ul>

        <H3>Win</H3>
        <p>
          A closed-won deal or successful outcome. Each row in the wins data
          source counts as <strong>1 win</strong>. Wins are attributed by win
          date and are summed into weekly, monthly, and lifetime totals. Win
          Stories (recorded in the Rep Self-Overrides section) capture the
          narrative details of each win but are separate from the numeric win
          count.
        </p>
        <ul className="list-disc !pl-14 space-y-1">
          <li>
            <strong>Technical Details:</strong> Sourced from{" "}
            <code>all_gtmx_wins</code>. Union of two sources:{" "}
            <strong>(1) all_gtmx_wins_from_ops</strong> — same 4-clause
            structure as Ops but filtered to{" "}
            <code>opportunity_iswon = TRUE</code> and won stages (ILIKE
            '%16%' through '%Won%').{" "}
            <strong>(2) mad_max_wins</strong> — from{" "}
            <code>google_sheet_mad_max</code> where status is "Boost
            Committed," "Offers Activated," or "Multiple Offers." Multiple
            Offers rows are duplicated (count as 2 wins).
          </li>
        </ul>

        <H3>Feedback</H3>
        <p>
          Qualitative or structured feedback received from a prospect or
          customer interaction. Each row in the feedback data source counts as{" "}
          <strong>1 feedback event</strong>. Feedback is attributed by feedback
          date and is summed into weekly, monthly, and lifetime totals.
        </p>
        <ul className="list-disc !pl-14 space-y-1">
          <li>
            <strong>Technical Details:</strong> Sourced from{" "}
            <code>all_gtmx_feedback</code>. Two sources unioned: Sterno
            feedback from <code>google_sheet_sterno</code> (where{" "}
            <code>feedback_completed = TRUE</code> and not disqualified), and
            Mad Max feedback from <code>google_sheets_mad_max_feedback</code>.
            Blank rep names default to Ross Armstrong (Sterno), Zoe Lang (Mad
            Max), or Lo Picton (Guest Pro).
          </li>
        </ul>

        <H3>General Notes</H3>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Dual-source model:</strong> All metrics (except TAM) pull
            from external data tables in real time. If a rep enters a non-zero
            value in Rep Self-Overrides for a given metric and week, that manual
            value completely replaces the external value for that cell.
          </li>
          <li>
            <strong>Weekly bucketing:</strong> Events are grouped into
            Monday-aligned weeks based on their date field.
          </li>
          <li>
            <strong>Monthly totals:</strong> Calculated using calendar-month
            boundaries so events are attributed to the correct month regardless
            of which week they fall in.
          </li>
          <li>
            <strong>Lifetime totals:</strong> The sum of all weekly values across
            the entire test duration.
          </li>
          <li>
            <strong>Conversion rates:</strong> Touch Rate (Touched Accounts /
            TAM), Call → Connect (Connects / Calls), Connect → Demo (Demos /
            Connects), and Demo → Win (Wins / Demos). Rates are calculated
            per-month and lifetime.
          </li>
        </ul>
      </Section>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-10 scroll-mt-16">
      <h2 className="text-2xl font-semibold mb-3 border-b border-border pb-2">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed [&>p]:pl-4 [&>ul]:pl-4 [&>h4]:pl-4">{children}</div>
    </section>
  );
}

function H3({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-lg font-semibold mt-5 mb-1 scroll-mt-16 text-accent">
      {children}
    </h3>
  );
}

function H4({ children }: { children: React.ReactNode }) {
  return <h4 className="text-base font-medium mt-3 mb-1">{children}</h4>;
}
