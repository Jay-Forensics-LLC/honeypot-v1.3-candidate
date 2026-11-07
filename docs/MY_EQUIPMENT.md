# My equipment

Use **My equipment** to keep a labeled inventory of your hardware, tools and
sensors. Choose **Add equipment**, enter a name and description, and select the
broad category. **Class** is your own grouping: for example **BLE Scanners**,
**Wi-Fi Adapters**, **ESP32**, or another label. **Value** is optional free text,
such as a price or reference. Neither field changes device configuration.

Mark entries active when they belong to your current setup. This inventory flag
does not start or stop hardware. Search and filters help you find entries by
name, class, value, category or reported status. Editing/removing an entry changes
the inventory only; it does not delete captures or saved telemetry.

Choose how each entry's status is tracked:

| Tracking | What the dashboard knows |
| --- | --- |
| Manual | Your reported status and when you recorded it; no automatic check |
| Local heartbeat | An authenticated local status report; becomes unknown after 120 seconds without a new report |
| HoneyTrace service/capture | Status at the last saved health observation; becomes unknown when that observation is stale or unavailable |
| Sentinel analyzer | Bundled/configured analyzer availability; Ready means installed, Operational means an analysis job is running |

Each card shows the status source and observation time. The page refreshes status
every fifteen seconds while open, without interrupting dialogs or keyboard focus.
An unavailable refresh keeps the last observation visible with a warning. Changing
the tracking method clears the previous report so it cannot impersonate a
heartbeat or another source.

The inventory is private local state at `honeypot/state/equipment.json` by default.
It works independently of import-module settings. Its current interface does not
discover USB devices, scan radios or attest hardware health. Future adapters can
report through the local authenticated status API; unknown is the expected state
until an observation exists.
