"use strict";

(() => {
  const asset = (path) => `assets/${path}`;
  const synthesis = (name) => asset(`cross_attention_guided_image_synthesis/${name}`);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function selectButton(buttons, selected) {
    buttons.forEach((button) => {
      button.classList.toggle("selected", button === selected);
      button.setAttribute("aria-pressed", String(button === selected));
    });
  }

  function refresh(element) {
    if (reducedMotion.matches) return;
    element.classList.remove("content-refresh");
    void element.offsetWidth;
    element.classList.add("content-refresh");
  }

  function setImage(id, src, alt) {
    const image = document.getElementById(id);
    image.src = src;
    image.alt = alt;
  }

  function imageButton(src, alt) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "image-button";
    button.dataset.zoom = "";
    const image = document.createElement("img");
    image.src = src;
    image.alt = alt;
    image.width = 512;
    image.height = 512;
    image.loading = "lazy";
    button.append(image);
    return button;
  }

  const teaser = document.getElementById("teaser");
  const teaserSteps = [...document.querySelectorAll("[data-teaser-step]")];
  const teaserScenes = [...document.querySelectorAll("[data-story-scene]")];
  const animateButton = document.getElementById("animate-teaser");
  const teaserProgress = document.querySelector(".story-progress > span");
  const teaserSequence = [
    {
      title: "Start with a subject and a prompt.",
      description: "Fine-tune on a few images of this teddy. At generation time, ask for the same subject with a blue house in the background.",
      duration: 4500,
    },
    {
      title: "Underfit: the scene is right, the teddy is not.",
      description: "Early checkpoints follow the prompt and produce varied layouts. But compare the teddies to the input photos: subject fidelity is low.",
      duration: 6000,
    },
    {
      title: "Overfit: the teddy is right, the scene is not.",
      description: "Later checkpoints have higher subject fidelity, but lose prompt fidelity and diversity. The requested blue house is absent from these training-like scenes.",
      duration: 6000,
    },
    {
      title: "Use early attention to guide the later checkpoint.",
      description: "From the same initial latent, guide the later model toward the early model’s cross-attention maps at each diffusion step—not by copying pixels.",
      duration: 7000,
    },
    {
      title: "Preserve the layout. Recover the subject.",
      description: "Compare each column: the reference scene composition is retained while subject fidelity improves. Layout preservation is approximate, not pixel-exact.",
      duration: 8500,
    },
  ];
  let teaserStage = reducedMotion.matches ? 5 : 1;
  let teaserTimer = null;
  let teaserStartedAt = 0;
  let teaserRemaining = teaserSequence[teaserStage - 1].duration;
  let teaserWantsPlayback = !reducedMotion.matches;
  let teaserVisible = false;
  let teaserReady = false;

  function suspendTeaserClock() {
    if (teaserTimer === null) return;
    window.clearTimeout(teaserTimer);
    teaserTimer = null;
    teaserRemaining = Math.max(0, teaserRemaining - (performance.now() - teaserStartedAt));
  }

  function updateTeaserPlayback() {
    const canPlay = teaserReady && teaserWantsPlayback && teaserVisible
      && !document.hidden && !document.querySelector("dialog[open]");
    if (canPlay && teaserTimer === null) {
      teaserStartedAt = performance.now();
      teaserTimer = window.setTimeout(() => {
        teaserTimer = null;
        showTeaserStep(teaserStage % teaserSequence.length + 1);
      }, teaserRemaining);
    } else if (!canPlay) {
      suspendTeaserClock();
    }
    teaser.dataset.playing = String(canPlay);
    animateButton.textContent = teaserWantsPlayback ? "Ⅱ Pause" : "▶ Play";
    animateButton.setAttribute("aria-pressed", String(teaserWantsPlayback));
    document.getElementById("teaser-explanation").setAttribute("aria-live", teaserWantsPlayback ? "off" : "polite");
  }

  function showTeaserStep(step) {
    suspendTeaserClock();
    teaserStage = step;
    const scene = teaserSequence[step - 1];
    teaserRemaining = scene.duration;
    teaser.dataset.stage = String(step);
    teaser.style.setProperty("--scene-duration", `${scene.duration}ms`);
    selectButton(teaserSteps, teaserSteps[step - 1]);
    teaserScenes.forEach((element) => { element.hidden = Number(element.dataset.storyScene) !== step; });
    document.getElementById("story-counter").textContent = `${step} / ${teaserSequence.length}`;
    document.getElementById("story-title").textContent = scene.title;
    document.getElementById("teaser-explanation").textContent = scene.description;
    teaserProgress.style.animationName = "none";
    void teaserProgress.offsetWidth;
    teaserProgress.style.animationName = "";
    updateTeaserPlayback();
  }

  teaser.classList.add("is-enhanced");
  showTeaserStep(teaserStage);
  teaserSteps.forEach((button) => button.addEventListener("click", () => {
    teaserWantsPlayback = false;
    showTeaserStep(Number(button.dataset.teaserStep));
  }));
  animateButton.addEventListener("click", () => {
    teaserWantsPlayback = !teaserWantsPlayback;
    updateTeaserPlayback();
  });
  document.getElementById("replay-teaser").addEventListener("click", () => {
    teaserWantsPlayback = true;
    showTeaserStep(1);
  });
  document.querySelector(".story-viewport").addEventListener("focusin", () => {
    teaserWantsPlayback = false;
    updateTeaserPlayback();
  });
  const teaserObserver = new IntersectionObserver(([entry]) => {
    teaserVisible = entry.isIntersecting && entry.intersectionRatio >= 0.2;
    updateTeaserPlayback();
  }, { threshold: [0, 0.2] });
  teaserObserver.observe(document.querySelector(".story-viewport"));
  Promise.all([...teaser.querySelectorAll("img")].map((image) => image.decode().catch(() => undefined))).then(() => {
    teaserReady = true;
    updateTeaserPlayback();
  });
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) {
      teaserWantsPlayback = false;
      showTeaserStep(5);
    }
  });

  const checkpoints = [
    [5, 1, 9], [25, 1, 3], [50, 3, 9], [75, 0, 8], [100, 0, 4],
    [125, 0, 9], [150, 1, 6], [175, 0, 9], [1000, 2, 8],
  ];
  const checkpointRange = document.getElementById("checkpoint-range");
  const playButton = document.getElementById("play-checkpoints");
  let playback = null;
  function showCheckpoint(index) {
    const [steps, first, second] = checkpoints[index];
    checkpointRange.value = String(index);
    checkpointRange.setAttribute("aria-valuetext", `${steps.toLocaleString("en-US")} training steps`);
    document.getElementById("step-output").value = steps.toLocaleString("en-US");
    [["a", first], ["b", second]].forEach(([key, sample], sampleIndex) => {
      setImage(`checkpoint-image-${key}`, asset(`backpack_overfitting/checkpoint-${steps}/synthetic_image_${sample}.jpg`), `Figure 2, ${steps} training steps, sample ${sampleIndex + 1}; prompt: a backpack* on a cobblestone street`);
    });
    document.getElementById("checkpoint-description").textContent = index < 2
      ? `${steps} steps: high prompt fidelity and diversity, but low subject fidelity.`
      : index < 8
        ? `${steps} steps: subject fidelity improves as fine-tuning increasingly constrains the generated scenes.`
        : "1,000 steps: the model reproduces training images, with low prompt fidelity and diversity.";
  }
  function stopPlayback() {
    window.clearInterval(playback);
    playback = null;
    playButton.setAttribute("aria-pressed", "false");
    playButton.setAttribute("aria-label", "Play checkpoint progression");
    playButton.textContent = "▶";
  }
  checkpointRange.addEventListener("input", () => {
    stopPlayback();
    showCheckpoint(Number(checkpointRange.value));
  });
  playButton.addEventListener("click", () => {
    if (playback !== null) {
      stopPlayback();
      return;
    }
    if (Number(checkpointRange.value) === checkpoints.length - 1) showCheckpoint(0);
    playButton.setAttribute("aria-pressed", "true");
    playButton.setAttribute("aria-label", "Pause checkpoint progression");
    playButton.textContent = "Ⅱ";
    playback = window.setInterval(() => {
      const next = Number(checkpointRange.value) + 1;
      if (next >= checkpoints.length) {
        stopPlayback();
        return;
      }
      showCheckpoint(next);
      if (next === checkpoints.length - 1) stopPlayback();
    }, 1400);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopPlayback();
    updateTeaserPlayback();
  });

  const attentionConfigurations = [
    ["5", "5 steps", "Guidance model", false],
    ["250", "250 steps", "Edit model · Without guidance", false],
    ["250_with_attn_guidance", "250 steps + CAG", "Edit model with cross-attention guidance", true],
  ];
  const attentionGrid = document.getElementById("attention-grid");
  attentionConfigurations.forEach(([checkpoint, title, description, guided], index) => {
    const column = document.createElement("div");
    column.className = `attention-column${guided ? " guided" : ""}`;
    const heading = document.createElement("h4");
    heading.textContent = title;
    const subtitle = document.createElement("span");
    subtitle.textContent = description;
    heading.append(subtitle);
    const directory = asset(`cross_attn_maps_crop/backpack/attention_synthetic_image_2_ckpt_${checkpoint}`);
    const result = imageButton(`${directory}/result.jpg`, `Figure 3, ${title}; literal prompt: a sks backpack on a cobblestone street`);
    const map = imageButton(`${directory}/008.jpg`, `Figure 3, ${title}; cross-attention for token street`);
    map.querySelector("img").id = `attention-map-${index}`;
    column.append(heading, result, map);
    attentionGrid.append(column);
  });
  const tokenButtons = [...document.querySelectorAll("[data-token]")];
  tokenButtons.forEach((button) => button.addEventListener("click", () => {
    attentionConfigurations.forEach(([checkpoint, title], index) => {
      setImage(`attention-map-${index}`, asset(`cross_attn_maps_crop/backpack/attention_synthetic_image_2_ckpt_${checkpoint}/${button.dataset.token}.jpg`), `Figure 3, ${title}; cross-attention for token ${button.textContent}`);
    });
    selectButton(tokenButtons, button);
    refresh(attentionGrid);
  }));

  const scenes = [
    { id: 1, subject: "bowl", prompt: "a bowl* on the beach" },
    { id: 2, subject: "cat", prompt: "a cat* with a mountain in the background" },
    { id: 3, subject: "candle", prompt: "a candle* on top of green grass with sunflowers around it" },
    { id: 4, subject: "toy", prompt: "a toy* in the snow" },
    { id: 5, subject: "toy", prompt: "a toy* with a blue house in the background" },
    { id: 6, subject: "cat", prompt: "a cat* in a police outfit" },
    { id: 7, subject: "teddy", prompt: "a teddy* with a wheat field in the background" },
    { id: 8, subject: "bowl", prompt: "a bowl* on top of pink fabric" },
  ];
  const sceneButtons = [...document.querySelectorAll("[data-scene]")];
  function showScene(index) {
    const scene = scenes[index];
    document.getElementById("scene-prompt").textContent = `Prompt: “${scene.prompt}”`;
    setImage("scene-input", synthesis(`in${scene.id}.${scene.id === 5 ? "jpeg" : "jpg"}`), `Figure 4 input subject: personalized ${scene.subject}`);
    [["under", "Underfit guidance checkpoint"], ["over", "Overfit edit checkpoint"], ["ours", "DreamBlend"]].forEach(([key, label]) => {
      setImage(`scene-${key}`, synthesis(`${key}${scene.id}.jpg`), `Figure 4, ${label}; prompt: ${scene.prompt}`);
    });
    selectButton(sceneButtons, sceneButtons[index]);
    refresh(document.getElementById("comparison-grid"));
  }
  sceneButtons.forEach((button) => button.addEventListener("click", () => showScene(Number(button.dataset.scene))));

  const generalizationButtons = [...document.querySelectorAll("[data-generalization]")];
  const generalizationPanels = [...document.querySelectorAll("[data-generalization-panel]")];
  function showGeneralization(key) {
    generalizationPanels.forEach((panel) => {
      panel.hidden = panel.dataset.generalizationPanel !== key;
      if (!panel.hidden) refresh(panel);
    });
    selectButton(generalizationButtons, generalizationButtons.find((button) => button.dataset.generalization === key));
  }
  generalizationButtons.forEach((button) => button.addEventListener("click", () => showGeneralization(button.dataset.generalization)));
  showGeneralization("sdxl");
  document.getElementById("generalization").classList.add("is-enhanced");

  const dialog = document.getElementById("image-dialog");
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-zoom]");
    if (!button) return;
    const image = button.querySelector("img");
    const dialogImage = document.getElementById("dialog-image");
    dialogImage.src = image.src;
    dialogImage.alt = image.alt;
    document.getElementById("dialog-caption").textContent = image.alt;
    dialog.showModal();
    updateTeaserPlayback();
  });
  dialog.addEventListener("close", updateTeaserPlayback);
  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  document.getElementById("copy-citation").addEventListener("click", async () => {
    const citation = document.getElementById("bibtex");
    const status = document.getElementById("copy-status");
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(citation.textContent);
      status.textContent = "BibTeX copied to clipboard.";
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(citation);
      selection.removeAllRanges();
      selection.addRange(range);
      status.textContent = "Citation selected. Press Command+C on Mac or Ctrl+C to copy.";
    }
  });
})();
