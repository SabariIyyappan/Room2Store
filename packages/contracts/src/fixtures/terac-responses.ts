import type { TeracPanelResponse } from "../entities.ts";

const missingInformation = [
  "Show the arm-rest wear in a close-up.",
  "Include the seat-height range.",
  "State the available pickup times.",
  "Add a photo of the adjustment controls.",
];

export const fixtureTeracResponses: TeracPanelResponse[] = Array.from({ length: 50 }, (_, index) => {
  const maximumWillingnessToPay = 22 + (index % 5) * 4;

  return {
    respondentId: `respondent_${String(index + 1).padStart(3, "0")}`,
    wouldBuy: maximumWillingnessToPay >= 28,
    maximumWillingnessToPay,
    missingInformation: missingInformation[index % missingInformation.length],
    strongestPhotoRank: (index % 4) + 1,
  };
});
