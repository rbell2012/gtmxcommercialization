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
          attainment, and monitor real-time activity data — all in one place.
        </p>

        <H3>Navigating the App</H3>
        <ul className="list-disc pl-5 space-y-1">
          <li>The <strong>sticky navigation bar</strong> at the top of every page gives you one-click access to each active team, Data &amp; Findings, Quota, and Settings.</li>
          <li>Click any <strong>team name</strong> in the nav to jump directly to that pilot's dashboard.</li>
          <li>The <strong>Settings</strong> link (gear icon) is on the far right.</li>
        </ul>

        <H3>Deep Linking</H3>
        <p>
          Every pilot page supports URL-based navigation. You can share a link
          like <code className="text-sm bg-muted px-1 rounded">/Pilots/Mad_Max#weekly-data</code> to
          point someone directly to the Weekly Data section of a specific pilot.
          Available anchors: <code className="text-sm bg-muted px-1 rounded">#manager-inputs</code>,{" "}
          <code className="text-sm bg-muted px-1 rounded">#test-signals</code>,{" "}
          <code className="text-sm bg-muted px-1 rounded">#players-section</code>,{" "}
          <code className="text-sm bg-muted px-1 rounded">#weekly-data</code>.
        </p>

        <H3>Dark Mode</H3>
        <p>
          Click the sun/moon icon in the navigation bar to toggle between light
          mode, dark mode, and your system default.
        </p>
      </Section>

      {/* ---- 2. Settings ---- */}
      <Section id="settings" title="2. Settings — Managing Teams &amp; Members">
        <p>
          The{" "}
          <Link to="/settings" className="text-primary underline">
            Settings
          </Link>{" "}
          page is where you configure teams and members. All changes here
          propagate automatically to the Pilots, Quota, and Data pages.
        </p>

        <H3>Creating a Team</H3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Click <strong>"New Team"</strong> and enter a name and owner.</li>
          <li>Pick a <strong>Start Date</strong> — the End Date auto-fills to 9 months later but can be adjusted.</li>
          <li>The team will appear in the nav bar and on the Pilots page once created.</li>
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
          inactive. Inactive teams are hidden from the nav bar and Pilots page
          but retain all data. Toggle it back on at any time.
        </p>

        <H3>Archiving (Deleting) a Team</H3>
        <p>
          Click the delete button on a team card. A confirmation dialog will
          appear. Archiving is a <strong>soft delete</strong> — all historical
          data is preserved. Members are moved to the unassigned pool.
        </p>

        <H3>Editing a Team</H3>
        <p>Click the <strong>pencil icon</strong> on any team card to open the Edit Team modal. From here you can change:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Name, Owner, Lead Rep, Start/End Dates</strong></li>
          <li>
            <strong>Monthly Goals</strong> — Toggle individual metrics on or off,
            set per-level targets (ADR, BDR, Rep, Senior, Principal, Lead), and
            enable Parity mode to auto-split team goals across members.
          </li>
          <li>
            <strong>Goal Scope (Self vs Team)</strong> — For each metric, choose
            whether the goal is measured per individual rep or as a summed team
            total.
          </li>
          <li>
            <strong>Accelerators</strong> — Define stackable IF/THEN rules that
            modify quota. For example: "IF Calls &gt; 600 THEN +10% to Quota."
            Each rule has its own condition, effect, and Self/Team scope.
          </li>
        </ul>
        <p>The <strong>Save Changes</strong> button stays pinned at the bottom of the modal so you can save from any scroll position.</p>

        <H3>Managing Members</H3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Add a member</strong> by clicking "New Member" — enter a name and optionally set their level.</li>
          <li><strong>Edit inline</strong> — click a member's name or level in the table to edit in place. A pencil icon appears on hover.</li>
          <li><strong>Remove a member</strong> — this archives them (soft delete). Their funnel data and win stories remain on the team for historical reporting.</li>
          <li><strong>Move a member</strong> between teams — the member is archived on the source team (data stays) and a fresh record is created on the target team.</li>
        </ul>
      </Section>

      {/* ---- 3. Pilots Page ---- */}
      <Section id="pilots" title="3. Pilots Page — The Main Dashboard">
        <p>
          The{" "}
          <Link to="/Pilots" className="text-primary underline">
            Pilots
          </Link>{" "}
          page is the heart of the app. Each team gets its own tab with four
          collapsible sections.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Switch teams</strong> by clicking tabs at the top or using the nav bar links.</li>
          <li><strong>Collapse/expand sections</strong> by clicking any section header (Manager Inputs, Test Signals, Player's Section, Weekly Data). A chevron icon indicates the current state.</li>
        </ul>

        <H3 id="manager-inputs">3a. Manager Inputs</H3>

        <H4>Test Phases</H4>
        <ul className="list-disc pl-5 space-y-1">
          <li>Phases are <strong>auto-generated</strong> from the team's start and end dates — one phase per calendar month.</li>
          <li>The progress bar fills automatically: past months show 100%, the current month shows proportional progress, future months show 0%.</li>
          <li>Click the <strong>phase label</strong> to edit its description.</li>
          <li>Click <strong>"Extend the Test"</strong> to add one month to the team's end date.</li>
          <li>If no dates are set, you'll see a link to Settings to configure them.</li>
        </ul>

        <H4>Mission &amp; Purpose</H4>
        <p>A free-text field where managers describe the team's mission. Saved automatically.</p>

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
            member's weekly funnel. Click <strong>Edit</strong> to change it —
            the new value applies from the current week forward while older weeks
            retain their original value.
          </li>
        </ul>

        <H4>Monthly Goals</H4>
        <ul className="list-disc pl-5 space-y-1">
          <li>Displays a read-only table of each enabled metric with the member's current value, goal target, progress bar, and percentage.</li>
          <li>Percentages are uncapped — values above 100% turn green to indicate the goal has been exceeded.</li>
          <li>Active and former members are shown in separate groups.</li>
          <li>Goals are configured in Settings, not on this page.</li>
        </ul>

        <H4>Month Look-Back</H4>
        <p>
          Click any <strong>month segment</strong> in the test phases bar to view
          that month's historical data across the entire page. A banner shows
          which month you're viewing with a <strong>"Back to Current"</strong>{" "}
          link to return.
        </p>

        <H3 id="test-signals">3b. Test Signals</H3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Stat cards</strong> show current-month totals for Ops, Demos, Wins, Feedback, and Activity.</li>
          <li>The <strong>Total Wins</strong> card includes a trend arrow — up (green) if wins are higher than last week, down (red) if lower.</li>
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

        <H3 id="players-section">3c. Player's Section</H3>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Your Funnels:</strong> Each active member has a weekly input
            form with fields for Activity, Calls, Connects, Ops, Demos, Wins,
            and Feedback, plus a role dropdown (TOFU, Closing, etc.).
          </li>
          <li>
            External data from the reporting system is merged as a baseline —
            any non-zero value you enter manually will take precedence.
          </li>
          <li>
            <strong>Win Stories:</strong> Record wins with a restaurant name,
            story, and date. A duck is earned for every 3 wins.
          </li>
          <li>Data should be updated weekly by <strong>Tuesday 12pm EST</strong>.</li>
        </ul>

        <H3 id="weekly-data">3d. Weekly Data</H3>
        <ul className="list-disc pl-5 space-y-1">
          <li>A comprehensive grid showing every metric per member per week, starting from the team's start date through the current week.</li>
          <li>Columns are <strong>Monday-aligned</strong>. The most recent weeks are visible first — scroll left to see older weeks.</li>
          <li><strong>Player</strong> and <strong>Metric</strong> columns are frozen on the left; <strong>Total</strong> is frozen on the right.</li>
          <li>TAM values <strong>carry forward</strong> — once set, TAM persists in future weeks until a new value is submitted.</li>
          <li>Conversion rate rows (Touch Rate, Call-to-Connect, Connect-to-Demo, Demo-to-Win) are included below the metric rows.</li>
          <li>
            Below a thick separator line, the <strong>Team Monthly Aggregate</strong>{" "}
            section shows summed team totals grouped by calendar month.
          </li>
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
        </ul>
      </Section>

      {/* ---- 5. Data & Findings ---- */}
      <Section id="data" title="5. Data &amp; Findings Page">
        <p>
          The{" "}
          <Link to="/data" className="text-primary underline">
            Data &amp; Findings
          </Link>{" "}
          page provides two things:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Hex Dashboard:</strong> An interactive embed pulling data
            from Snowflake, Sheets, and Chorus. Use it to explore raw activity
            data, call metrics, and feedback.
          </li>
          <li>
            <strong>Findings:</strong> Write and save notes or observations.
            Recent findings are listed below the input form.
          </li>
        </ul>
      </Section>

      {/* ---- 6. Real-Time Data ---- */}
      <Section id="realtime" title="6. Real-Time Data">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Activity data from the external reporting system (superhex) syncs
            in <strong>real time</strong>. When new data is inserted or updated,
            the app refreshes automatically — no manual page reload needed.
          </li>
          <li>
            External data provides the <strong>baseline</strong>. Any non-zero
            value entered manually in the Player's Section will override the
            external value for that metric and week.
          </li>
        </ul>
      </Section>

      {/* ---- 7. Tips ---- */}
      <Section id="tips" title="7. Tips &amp; Shortcuts">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Hover over the quota %</strong> on the Quota page for a
            complete calculation breakdown.
          </li>
          <li>
            <strong>Hover over accelerator lock icons</strong> to see exactly
            which rule triggered and its effect.
          </li>
          <li>
            <strong>Share deep links</strong> — use URLs
            like <code className="text-sm bg-muted px-1 rounded">/Pilots/Mad_Max#weekly-data</code> to
            point someone to a specific section.
          </li>
          <li>
            <strong>Former members</strong> remain visible in read-only mode
            throughout the app. Their historical data is never lost.
          </li>
          <li>
            <strong>Collapse sections</strong> you aren't using to reduce
            scrolling on the Pilots page.
          </li>
          <li>
            <strong>Dark mode</strong> adapts all charts, cards, and text for
            comfortable viewing in low-light environments.
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
      <div className="space-y-3 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function H3({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-lg font-semibold mt-5 mb-1 scroll-mt-16">
      {children}
    </h3>
  );
}

function H4({ children }: { children: React.ReactNode }) {
  return <h4 className="text-base font-medium mt-3 mb-1">{children}</h4>;
}
