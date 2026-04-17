# Test Strategy

## Automated coverage

- CLI command surface
  - top-level command registration
  - guide surface shape
- CLI domain behavior
  - local session refresh persistence
  - policy/location default persistence
  - listing list request filters
  - listing spec normalization from YAML and local image paths
  - listing patch normalization
- Backend gateway behavior
  - Inventory locale header selection
  - policy opt-in payload shape
  - Trading active listing parsing
  - Trading sold listing parsing
  - Trading legacy item parsing
  - Trading revise inventory status request shape
  - Trading revise fixed-price item request shape
  - Trading end fixed-price item request shape
- Backend service dispatch
  - legacy update plan uses Trading revise action
  - legacy price/quantity apply uses Trading revise inventory status
  - legacy broader update apply uses Trading revise fixed-price item
  - legacy end plan/apply uses Trading end fixed-price item
  - Inventory price/quantity apply stays on Inventory bulk update
- Backend route smoke
  - anonymous local authorize start

## Manual or live verification still required

- browser OAuth completion on real eBay sandbox and production accounts
- live Trading `--apply` mutations against real listings
- live Inventory create/update flows against accounts with valid business policies and merchant locations
- eBay-side behavior changes or payload drift that are not represented in fixture XML

## Engineering rule

- Every production bug should become a regression test before the fix is considered complete.
- Every new command or dispatch path should have at least one automated test before deploy.
