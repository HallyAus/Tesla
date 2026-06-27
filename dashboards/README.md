# Tesla Tracker dashboard

A ready-to-use Lovelace dashboard for the **Tesla Tracker** integration:
`tesla_tracker_dashboard.yaml`.

## What's in it

- **KPI glance row** - distance today / this week / this month / this year.
- **Secondary stats** - yesterday, lifetime total, drives today, time driven,
  average distance per driving day, and the longest drive this month.
- **Daily distance chart** - stock `statistics-graph` (bar, last 30 days),
  using Home Assistant long-term statistics. No custom cards required.
- **Recent drives table** - stock `markdown` card summarising the last drive
  and the month's longest drive.
- **Recent route map** - stock `map` card showing the vehicle's recent path.

Everything above works with **stock Home Assistant cards** - no HACS frontend
plugins needed.

## Install

1. Settings -> Dashboards -> Add dashboard -> **New dashboard from scratch**.
2. Open the new dashboard, click the 3-dot menu (top right) -> **Edit
   dashboard** -> 3-dot menu -> **Raw configuration editor**.
3. Paste the contents of `tesla_tracker_dashboard.yaml`.
4. Save.

Alternatively, copy individual cards into an existing view.

## Adjusting entity IDs

The cards assume the default entity naming `sensor.tesla_tracker_*`. If you
renamed the Tesla Tracker device, update the entity IDs accordingly.

For the **map** card, replace `device_tracker.tesla` with your Tesla Fleet
location entity (the same one you selected as the tracker during setup).

## Optional HACS frontend cards

Two upgrades are included as clearly-commented optional sections. Install the
card from HACS (Frontend), then uncomment the relevant block.

### ApexCharts (`apexcharts-card`)

A richer daily-distance chart that reads the `daily_series` attribute exposed
on the weekly / monthly / yearly distance sensors directly - it does not depend
on the recorder's long-term statistics, so it shows data immediately.

- HACS -> Frontend -> search **apexcharts-card** -> install.

### Scrollable history table (`flex-table-card`)

For a full scrollable drive-history table. The integration keeps full history in
its own store; surface it to a table by either:

- exporting via the `tesla_tracker.export_drives` service, or
- creating a template sensor that exposes a `drives` attribute.

- HACS -> Frontend -> search **flex-table-card** -> install.

## Notes on statistics

The rolling-window distance sensors use `state_class: total`, so the
`statistics-graph` card's **change** stat type gives the per-day distance. The
lifetime `sensor.tesla_tracker_distance_total` uses `total_increasing`, suitable
for a cumulative meter-style view.
