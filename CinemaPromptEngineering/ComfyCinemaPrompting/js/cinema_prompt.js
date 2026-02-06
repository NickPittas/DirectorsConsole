import { app } from "/scripts/app.js";

function applyConfigToNode(node, payload) {
    if (!payload || !payload.config) return;

    const config = payload.config;
    if (payload.projectType === 'live_action') {
        const map = {
            user_prompt: config.user_prompt || payload.userPrompt,
            camera_manufacturer: config.camera?.manufacturer,
            camera_body: config.camera?.body,
            movement_equipment: config.movement?.equipment,
            movement_type: config.movement?.movement_type,
            movement_timing: config.movement?.timing,
            time_of_day: config.lighting?.time_of_day,
            lighting_source: config.lighting?.source,
            lighting_style: config.lighting?.style,
            shot_size: config.visual_grammar?.shot_size,
            composition: config.visual_grammar?.composition,
            mood: config.visual_grammar?.mood,
            color_tone: config.visual_grammar?.color_tone,
            lens_manufacturer: config.lens?.manufacturer,
            lens_family: config.lens?.family,
            focal_length_mm: config.lens?.focal_length_mm,
            is_anamorphic: config.lens?.is_anamorphic,
            film_preset: config.film_preset || "",
            era: config.era || "",
            cached_prompt: payload.prompt || (node.widgets.find(w => w.name === 'cached_prompt')?.value || ""),
            cached_enhanced_prompt: payload.enhancedPrompt || (node.widgets.find(w => w.name === 'cached_enhanced_prompt')?.value || ""),
        };
        Object.entries(map).forEach(([key, value]) => {
            if (value === undefined || value === null) return;
            const widget = node.widgets.find(w => w.name === key);
            if (widget) widget.value = value;
        });
    }
}

function createModal(node) {
    if (document.getElementById("cinema-prompt-modal")) {
        return;
    }

    const modal = document.createElement("div");
    modal.id = "cinema-prompt-modal";
    Object.assign(modal.style, {
        position: "fixed",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
        backgroundColor: "rgba(0,0,0,0.8)",
        zIndex: "10000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
    });

    const content = document.createElement("div");
    Object.assign(content.style, {
        width: "90%",
        height: "90%",
        backgroundColor: "#1e1e1e",
        borderRadius: "8px",
        overflow: "hidden",
        position: "relative",
        boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
    });

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    Object.assign(closeBtn.style, {
        position: "absolute",
        top: "10px",
        right: "10px",
        zIndex: "10001",
        background: "transparent",
        border: "none",
        color: "white",
        fontSize: "24px",
        cursor: "pointer",
    });

    const messageHandler = (event) => {
        if (event.data && event.data.type === 'READY') {
            iframe.contentWindow?.postMessage({ type: 'INIT_CONFIG', payload: buildPayload() }, '*');
            return;
        }
        if (event.data && event.data.type === 'UPDATE_CONFIG') {
            if (event.data.payload && event.data.payload.userPrompt !== undefined) {
                const widget = node.widgets.find(w => w.name === 'user_prompt');
                if (widget) widget.value = event.data.payload.userPrompt;
            }
            if (event.data.payload && event.data.payload.config) {
                applyConfigToNode(node, event.data.payload);
            }
            if (event.data.payload && event.data.payload.prompt) {
                const widget = node.widgets.find(w => w.name === 'cached_prompt');
                if (widget) widget.value = event.data.payload.prompt;
            }
            if (event.data.payload && event.data.payload.enhancedPrompt) {
                const widget = node.widgets.find(w => w.name === 'cached_enhanced_prompt');
                if (widget) widget.value = event.data.payload.enhancedPrompt;
            }
        }
        if (event.data && event.data.type === 'CANCEL') {
            closeModal();
        }
    };

    const closeModal = () => {
        window.removeEventListener('message', messageHandler);
        if (modal.parentNode) {
            modal.parentNode.removeChild(modal);
        }
    };

    closeBtn.onclick = closeModal;
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };

    const iframe = document.createElement("iframe");
    iframe.src = "http://localhost:3000";
    Object.assign(iframe.style, {
        width: "100%",
        height: "100%",
        border: "none",
    });

    window.addEventListener('message', messageHandler);

    const buildPayload = () => ({
        projectType: 'live_action',
        config: {
            user_prompt: node.widgets.find(w => w.name === 'user_prompt')?.value || '',
            camera: {
                manufacturer: node.widgets.find(w => w.name === 'camera_manufacturer')?.value,
                body: node.widgets.find(w => w.name === 'camera_body')?.value,
            },
            lens: {
                manufacturer: node.widgets.find(w => w.name === 'lens_manufacturer')?.value,
                family: node.widgets.find(w => w.name === 'lens_family')?.value,
                focal_length_mm: node.widgets.find(w => w.name === 'focal_length_mm')?.value,
                is_anamorphic: node.widgets.find(w => w.name === 'is_anamorphic')?.value,
            },
            movement: {
                equipment: node.widgets.find(w => w.name === 'movement_equipment')?.value,
                movement_type: node.widgets.find(w => w.name === 'movement_type')?.value,
                timing: node.widgets.find(w => w.name === 'movement_timing')?.value,
            },
            lighting: {
                time_of_day: node.widgets.find(w => w.name === 'time_of_day')?.value,
                source: node.widgets.find(w => w.name === 'lighting_source')?.value,
                style: node.widgets.find(w => w.name === 'lighting_style')?.value,
            },
            visual_grammar: {
                shot_size: node.widgets.find(w => w.name === 'shot_size')?.value,
                composition: node.widgets.find(w => w.name === 'composition')?.value,
                mood: node.widgets.find(w => w.name === 'mood')?.value,
                color_tone: node.widgets.find(w => w.name === 'color_tone')?.value,
            },
            film_preset: node.widgets.find(w => w.name === 'film_preset')?.value || '',
            era: node.widgets.find(w => w.name === 'era')?.value || '',
        },
        userPrompt: node.widgets.find(w => w.name === 'user_prompt')?.value || '',
        prompt: node.widgets.find(w => w.name === 'cached_prompt')?.value || '',
        enhancedPrompt: node.widgets.find(w => w.name === 'cached_enhanced_prompt')?.value || '',
    });

    iframe.addEventListener('load', () => {
        iframe.contentWindow?.postMessage({ type: 'INIT_CONFIG', payload: buildPayload() }, '*');
        setTimeout(() => {
            iframe.contentWindow?.postMessage({ type: 'INIT_CONFIG', payload: buildPayload() }, '*');
        }, 500);
    });

    node.widgets.forEach((widget) => {
        const original = widget.callback;
        widget.callback = function () {
            if (original) original.apply(this, arguments);
            iframe.contentWindow?.postMessage({ type: 'INIT_CONFIG', payload: buildPayload() }, '*');
        };
    });

    content.appendChild(closeBtn);
    content.appendChild(iframe);
    modal.appendChild(content);
    document.body.appendChild(modal);
}

app.registerExtension({
    name: "CinemaPrompt.Frontend",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "ComfyCinemaPromptingLive" || nodeData.name === "ComfyCinemaPromptingAnim") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

                this.addWidget("button", "Open Visual Editor", null, () => {
                    createModal(this);
                });

                return r;
            };
        }
    },
});
