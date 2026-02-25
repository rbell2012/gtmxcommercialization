# Changelog

## 2026-02-24

### Location – Index page (Manager Inputs & Test Signals sections)

**Rationale:** Win Goals is a manager-level input (setting member targets), not a test signal (observed data). Moving it into the Manager Inputs section groups all configuration controls together and keeps the Test Signals section focused on metrics and outcomes.

**Changes:**
- Moved the Win Goals card (member list, editable goal inputs, progress bars, "+ Add Member" button) out of the Test Signals section inside each team tab and into the Manager Inputs section, positioned directly below Total TAM.
- Win Goals now displays only the active team's members — switching tabs updates the card to match the selected team.
- Consolidated the Add Member dialog into a single shared instance in the parent component instead of duplicating it inside every team tab.
- Replaced the per-team Dialog-based "Add First Member" empty state in Test Signals with a simple button that opens the parent dialog for the correct team.
- Removed `addMemberOpen`, `setAddMemberOpen`, `newName`, `setNewName`, `newGoal`, `setNewGoal`, and `addMember` props from the `TeamTab` component; replaced with a single `onAddMemberClick` callback.
---
