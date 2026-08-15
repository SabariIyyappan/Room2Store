const photoInput = document.querySelector("#photo-input");
const preview = document.querySelector("#preview");
const uploadCopy = document.querySelector("#upload-copy");
const identifyButton = document.querySelector("#identify-button");
const resultStep = document.querySelector("#result-step");
const completeStep = document.querySelector("#complete-step");
const error = document.querySelector("#error");
let photo;
let sessionId;

function showError(message = "") { error.textContent = message; }

photoInput.addEventListener("change", async () => {
  photo = photoInput.files[0];
  if (!photo) return;
  showError();
  preview.src = URL.createObjectURL(photo);
  preview.hidden = false;
  uploadCopy.hidden = true;
  identifyButton.disabled = false;
});

identifyButton.addEventListener("click", async () => {
  try {
    showError();
    identifyButton.disabled = true;
    identifyButton.textContent = "Identifying…";
    const response = await fetch("/api/identify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageName: photo.name, imageDataUrl: await resizePhoto(photo) })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    sessionId = data.sessionId;
    document.querySelector("#source-notice").textContent = sourceNotice(data.source);
    document.querySelector("#result-title").textContent = data.requiresChoice ? "Which product is this?" : "We found a likely match — please confirm.";
    document.querySelector("#candidates").replaceChildren(...data.candidates.map(candidateCard));
    applyVisionFields(data);
    resultStep.hidden = false;
  } catch (caught) {
    showError(caught.message);
  } finally {
    identifyButton.disabled = false;
    identifyButton.textContent = "Identify item";
  }
});

function sourceNotice(source) {
  if (source === "demo-fallback") return "Demo identifier active: add a vision provider to inspect real photo pixels.";
  if (source === "pioneer-vision") return "Photo read by Pioneer vision.";
  return "Photo analyzed by your vision provider.";
}

/**
 * A model number is only pre-filled when the model actually read it off the
 * item. MODEL_UNKNOWN means the seller has to type it in before pricing.
 */
function applyVisionFields(data) {
  const modelField = document.querySelector("#model-field");
  const modelInput = document.querySelector("#model-number");
  const nameField = document.querySelector("#name-field");
  const nameInput = document.querySelector("#product-name");

  modelInput.value = data.needsModelNumber ? "" : data.vision?.model_number ?? "";
  modelField.hidden = !data.vision;
  modelInput.required = Boolean(data.needsModelNumber);

  nameInput.value = data.candidates[0]?.name ?? "";
  nameField.hidden = !data.fieldsEditable;
}

function candidateCard(candidate, index) {
  const label = document.createElement("label");
  label.className = "candidate";
  label.innerHTML = `<input type="radio" name="candidate" value="${candidate.id}" ${index === 0 ? "checked" : ""}>
    <span><strong>${candidate.name}</strong><small>${candidate.description}</small></span><em>${Math.round(candidate.confidence * 100)}% match</em>`;
  return label;
}

document.querySelector("#continue-button").addEventListener("click", async () => {
  try {
    showError();
    const candidateId = document.querySelector("input[name=candidate]:checked")?.value;
    const response = await fetch(`/api/items/${sessionId}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        candidateId,
        condition: document.querySelector("#condition").value,
        modelNumber: document.querySelector("#model-number").value,
        name: document.querySelector("#name-field").hidden ? undefined : document.querySelector("#product-name").value
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    document.querySelector("#item-name").textContent = data.item.name;
    document.querySelector("#price-result").textContent = data.item.naivePrice.amount === null
      ? `Comps lookup pending for “${data.item.compsQuery}”.`
      : `Provisional price: $${data.item.naivePrice.amount} (${data.item.naivePrice.method}).`;
    resultStep.hidden = true;
    completeStep.hidden = false;
  } catch (caught) { showError(caught.message); }
});

document.querySelector("#start-over").addEventListener("click", () => location.reload());

function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const ratio = Math.min(1, 1280 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * ratio);
      canvas.height = Math.round(image.height * ratio);
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    image.onerror = () => reject(new Error("That image could not be read."));
    image.src = URL.createObjectURL(file);
  });
}
