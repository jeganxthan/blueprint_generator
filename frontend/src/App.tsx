import { useEffect, useState, type WheelEvent } from "react";
import { generateBlueprint } from "./api";
import { renderBlueprint } from "./wasm";
import "./App.css";

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.4;
const ZOOM_STEP = 0.15;

function App() {
  const [prompt, setPrompt] = useState("");
  const [svg, setSvg] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setZoom(1);
  }, [svg]);

  const clampZoom = (value: number) => {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));
  };

  const zoomIn = () => {
    setZoom((current) => clampZoom(current + ZOOM_STEP));
  };

  const zoomOut = () => {
    setZoom((current) => clampZoom(current - ZOOM_STEP));
  };

  const resetZoom = () => {
    setZoom(1);
  };

  const handleCanvasWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!svg) {
      return;
    }
    event.preventDefault();
    setZoom((current) =>
      clampZoom(current + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP))
    );
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    try {
      setLoading(true);
      setError("");

      const blueprintData = await generateBlueprint(prompt);
      const svgOutput = await renderBlueprint(blueprintData);

      setSvg(svgOutput);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate blueprint";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="glow glow-one" aria-hidden />
      <div className="glow glow-two" aria-hidden />

      <main className="app-grid">
        <section className="panel controls">
          <p className="eyebrow">WASM + AI</p>
          <h1>Blueprint Generator</h1>
          <p className="lead">
            Describe a layout and generate a structured floor plan preview.
          </p>

          <label htmlFor="prompt" className="label">
            Prompt
          </label>
          <textarea
            id="prompt"
            rows={5}
            placeholder="Example: 2 bedrooms, 1 kitchen, 1 bathroom and a living room."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />

          <button onClick={handleGenerate} disabled={loading}>
            {loading ? "Generating..." : "Generate Blueprint"}
          </button>

          {error && <p className="error-text">{error}</p>}
        </section>

        <section className="panel preview">
          <div className="preview-head">
            <h2>Canvas</h2>
            <div className="preview-tools">
              <span className="status-pill">{svg ? "Rendered" : "Waiting"}</span>
              <div className="zoom-controls" aria-label="Zoom controls">
                <button
                  type="button"
                  className="zoom-btn"
                  onClick={zoomOut}
                  disabled={!svg || zoom <= MIN_ZOOM}
                >
                  -
                </button>
                <button
                  type="button"
                  className="zoom-btn zoom-fit"
                  onClick={resetZoom}
                  disabled={!svg}
                >
                  Fit
                </button>
                <button
                  type="button"
                  className="zoom-btn"
                  onClick={zoomIn}
                  disabled={!svg || zoom >= MAX_ZOOM}
                >
                  +
                </button>
                <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
              </div>
            </div>
          </div>

          <div className="blueprint-stage" onWheel={handleCanvasWheel}>
            {svg ? (
              <div className="canvas-scroll">
                <div
                  className="svg-host"
                  style={{ width: `${zoom * 100}%` }}
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              </div>
            ) : (
              <div className="empty-wrap">
                <p className="empty-state">
                  Your blueprint preview will appear here once generation completes.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
