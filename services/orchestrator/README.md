# Orchestrator service

Engineer B owns Band integration, the transition gate engine, and workflow coordination.

## B3: Band room bootstrap

The `BandRoomService` creates one campaign room through the Flow Coordinator,
adds the seven campaign roles, persists `bandRoomId` through the Room2Store API,
and exposes structured protocol message helpers.

```powershell
pnpm.cmd --filter @room2store/orchestrator band:verify
```

This validates configured agent identities without displaying their API keys.

After the Room2Store API has a campaign, create its live room with:

```powershell
pnpm.cmd --filter @room2store/orchestrator band:bootstrap -- <campaign-id>
```

The command creates a Band room, adds all seven role agents, posts the startup
handoff, and saves the resulting `bandRoomId` to that campaign.

All gate evidence is sent as a text message that mentions the Flow Coordinator;
an event with the same payload is also posted for the human-visible Band log.

## B4: Gate engine

`GateEngine` permits a state transition only when the relevant prior protocol
message is present in the campaign room. On denial it posts `gate blocked` and
does not call the state-changing callback. Its gates cover catalog-to-research,
evidence-to-price, compliance-to-deploy, floor-to-sale, and sale-to-payment.
