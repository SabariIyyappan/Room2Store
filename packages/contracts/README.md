# Shared contracts

This package is the only shared code surface in Room2Store. At C0, Engineers
A, B, and C review and freeze it together. Changes after that require explicit
three-way agreement.

## Exports

- `@room2store/contracts` — entities, statuses, Band protocol, and validators
- `@room2store/contracts/fixtures` — deterministic C0/C1 demo data

## C0 review checklist

- Confirm every core entity field is sufficient for its writer and readers.
- Confirm campaign and item status values are used exactly as declared.
- Confirm every Band message name and payload matches the gate contract.
- Confirm the chair, headphones, lamp, approval, car-seat veto, and 50-response
  fixtures meet A and C's development needs.

Once agreed, downstream services consume these types rather than defining their
own copies.
