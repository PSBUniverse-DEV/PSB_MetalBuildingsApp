"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import AppIcon from "@/shared/components/ui/AppIcon";
import {
  lookupMatrixPrice,
  getUniqueDimensionValues,
  applyRegionMultiplier,
  calcPanelOptionPrice,
  calcTotalPanelPrice,
  formatCurrency,
} from "../data/metalBuildings.data";

const BuildingPreview = dynamic(() => import("./BuildingPreview"), { ssr: false });

// ─── CONFIGURATOR VIEW ─────────────────────────────────────

export default function ConfiguratorView({ data }) {
  const { styles, regions, features, matrixPrices, panelLocations, panelOptions, rates, options, doorWindowItems, colorGroups, colorOptions } = data;

  // Style selection
  const [selectedStyleId, setSelectedStyleId] = useState(styles[0]?.style_id ?? null);

  // Region / state selection
  const [selectedRegion, setSelectedRegion] = useState(null);

  // Base structure state
  const baseFeature = features.find((f) => f.is_required);
  const baseFeatureId = baseFeature?.feature_id;

  // Dimension values for current style
  const widths = useMemo(() => getUniqueDimensionValues(matrixPrices, baseFeatureId, selectedStyleId, "width"), [matrixPrices, baseFeatureId, selectedStyleId]);
  const lengths = useMemo(() => getUniqueDimensionValues(matrixPrices, baseFeatureId, selectedStyleId, "length"), [matrixPrices, baseFeatureId, selectedStyleId]);
  const heights = useMemo(() => getUniqueDimensionValues(matrixPrices, baseFeatureId, selectedStyleId, "height"), [matrixPrices, baseFeatureId, selectedStyleId]);

  const [width, setWidth] = useState(widths[0] ?? 12);
  const [length, setLength] = useState(lengths[0] ?? 20);
  const [height, setHeight] = useState(heights[0] ?? 6);

  // Reset dimensions when available sizes change (render-time adjustment)
  const [prevStyleId, setPrevStyleId] = useState(selectedStyleId);
  if (prevStyleId !== selectedStyleId) {
    setPrevStyleId(selectedStyleId);
    if (widths.length > 0 && !widths.includes(width)) setWidth(widths[0]);
    if (lengths.length > 0 && !lengths.includes(length)) setLength(lengths[0]);
    if (heights.length > 0 && !heights.includes(height)) setHeight(heights[0]);
  }

  // Accordion open state
  const [openSection, setOpenSection] = useState("style");

  // Panel (Sides & Ends) state
  const panelFeature = features.find((f) => f.pricing_type === "PANEL");
  const [wallMode, setWallMode] = useState("open");
  const [wallSelections, setWallSelections] = useState({});

  // Other add-ons line items
  const [addOnItems, setAddOnItems] = useState({});

  // Doors & Windows state — { [wall]: [{ item_id, name, price }] }
  const doorWindowFeature = features.find((f) => f.pricing_type === "PER_ITEM");
  const [doorWindowSelections, setDoorWindowSelections] = useState({ left: [], back: [], right: [], front: [] });
  const [activeWall, setActiveWall] = useState("right");

  // Colors state — { [color_group_id]: color_option_id }
  const colorFeature = features.find((f) => f.pricing_type === "COLOR");
  const [colorSelections, setColorSelections] = useState({});

  // 3D highlight wall (when editing doors/windows)
  const [highlightedWall, setHighlightedWall] = useState(null);

  // Initialize wall selections to "Open" for all locations (lazy initializer)
  const [wallSelectionsInited, setWallSelectionsInited] = useState(false);
  if (!wallSelectionsInited && panelLocations.length > 0 && panelOptions.length > 0) {
    setWallSelectionsInited(true);
    const initial = {};
    for (const loc of panelLocations) {
      const openOpt = panelOptions.find(
        (o) => o.feature_id === panelFeature?.feature_id && o.location_type === loc.location_type && o.name === "Open"
      );
      if (openOpt) initial[loc.location_id] = openOpt.option_id;
    }
    setWallSelections(initial);
  }

  // Apply mode presets
  const applyMode = useCallback(
    (mode) => {
      setWallMode(mode);
      if (mode === "custom" || !panelFeature) return;
      const newSelections = {};
      for (const loc of panelLocations) {
        let targetName = "Open";
        if (mode === "enclosed") targetName = "Fully Enclosed";
        else if (mode === "gable") targetName = loc.location_type === "end" ? "Gable End" : "Open";
        const opt = panelOptions.find(
          (o) => o.feature_id === panelFeature.feature_id && o.location_type === loc.location_type && o.name === targetName
        );
        if (opt) newSelections[loc.location_id] = opt.option_id;
      }
      setWallSelections(newSelections);
    },
    [panelFeature, panelLocations, panelOptions]
  );

  // ─── PRICING CALCULATIONS ────────────────────────────────

  const basePrice = useMemo(() => {
    if (!baseFeature) return 0;
    return lookupMatrixPrice(matrixPrices, baseFeature.feature_id, selectedStyleId, width, length, height) ?? 0;
  }, [baseFeature, matrixPrices, selectedStyleId, width, length, height]);

  const panelPrice = useMemo(() => {
    if (!panelFeature) return 0;
    const locs = panelLocations.filter((l) => l.feature_id === panelFeature.feature_id);
    const opts = panelOptions.filter((o) => o.feature_id === panelFeature.feature_id);
    return calcTotalPanelPrice(wallSelections, locs, opts, width, length);
  }, [panelFeature, panelLocations, panelOptions, wallSelections, width, length]);

  const addOnTotal = useMemo(() => {
    return Object.values(addOnItems).reduce((sum, item) => sum + (item?.price ?? 0), 0);
  }, [addOnItems]);

  // Doors & Windows total
  const doorWindowTotal = useMemo(() => {
    return Object.values(doorWindowSelections).flat().reduce((sum, item) => sum + Number(item.price), 0);
  }, [doorWindowSelections]);

  // Colors upcharge total
  const colorUpchargeTotal = useMemo(() => {
    let total = 0;
    for (const [groupId, optionId] of Object.entries(colorSelections)) {
      const opt = colorOptions.find((o) => o.color_option_id === optionId);
      if (opt) total += Number(opt.upcharge);
    }
    return total;
  }, [colorSelections, colorOptions]);

  const subtotal = basePrice + panelPrice + addOnTotal + doorWindowTotal + colorUpchargeTotal;
  const grandTotal = useMemo(() => applyRegionMultiplier(subtotal, selectedRegion), [subtotal, selectedRegion]);
  const regionAdjustment = grandTotal - subtotal;

  const updateAddOn = useCallback((featureId, item) => {
    setAddOnItems((prev) => {
      const next = { ...prev };
      if (!item) delete next[featureId];
      else next[featureId] = item;
      return next;
    });
  }, []);

  // Other features (not base, not panel, not doors/windows, not colors)
  const otherFeatures = features.filter((f) => !f.is_required && !["PANEL", "PER_ITEM", "COLOR"].includes(f.pricing_type));
  const categories = [...new Set(otherFeatures.map((f) => f.category).filter(Boolean))];

  const toggleSection = (section) => {
    setOpenSection((prev) => (prev === section ? null : section));
    if (section !== "doors") setHighlightedWall(null);
  };

  // Labels
  const selectedStyle = styles.find((s) => s.style_id === selectedStyleId);
  const sizeLabel = `${width}' × ${length}' × ${height}'`;
  const headerLabel = `${selectedStyle?.name ?? "Structure"} (${width}×${length}×${height})`;
  const wallModeLabel = wallMode === "open" ? "Fully Open" : wallMode === "enclosed" ? "Fully Enclosed" : wallMode === "gable" ? "Gable Ends" : "Custom";

  // 3D preview props
  const roofStyleMap = { "Regular Carport": "regular", "A-Frame Carport": "aframe", "A-Frame Vertical": "vertical", "Garage": "garage", "Barn": "barn" };
  const roofStyle3d = roofStyleMap[selectedStyle?.name] ?? "regular";
  const walls3d = useMemo(() => {
    if (!panelFeature) return {};
    const locs = panelLocations.filter((l) => l.feature_id === panelFeature.feature_id);
    const result = {};
    for (const loc of locs) {
      const optId = wallSelections[loc.location_id];
      const opt = panelOptions.find((o) => o.option_id === optId);
      const isEnclosed = opt && opt.name !== "Open";
      if (loc.name.includes("Front")) result.front = isEnclosed;
      else if (loc.name.includes("Back")) result.back = isEnclosed;
      else if (loc.name.includes("Left")) result.left = isEnclosed;
      else if (loc.name.includes("Right")) result.right = isEnclosed;
    }
    return result;
  }, [panelFeature, panelLocations, panelOptions, wallSelections]);

  // Quote modal
  const [showQuote, setShowQuote] = useState(false);

  // Disable body scroll while configurator is mounted
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div className="d-flex" style={{ height: "calc(100vh - 56px)", overflow: "hidden" }}>
      {/* Left column — 3D preview (70%) */}
      <div style={{ flex: "0 0 70%", position: "relative", background: "var(--psb-bg)" }}>
        <BuildingPreview width={width} length={length} height={height} roofStyle={roofStyle3d} walls={walls3d} highlightedWall={highlightedWall} roofColor={(() => { const grp = colorGroups.find(g => g.name === "Roof"); if (!grp) return "#cc0000"; const opt = colorOptions.find(o => o.color_option_id === colorSelections[grp.color_group_id]); return opt?.hex_code ?? "#cc0000"; })()} wallColor={(() => { const grp = colorGroups.find(g => g.name === "Siding"); if (!grp) return "#e0e0e0"; const opt = colorOptions.find(o => o.color_option_id === colorSelections[grp.color_group_id]); return opt?.hex_code ?? "#e0e0e0"; })()} />
        <div style={{ position: "absolute", top: 16, left: 16 }}>
          <h5 className="mb-0 fw-bold text-dark">{headerLabel}</h5>
        </div>
      </div>

      {/* Right column — menu (30%) */}
      <div style={{ flex: "0 0 30%", overflowY: "auto", borderLeft: "1px solid var(--psb-border)" }} className="p-3">
        {/* Get Quote button */}
        <button className="btn btn-primary w-100 mb-3 fw-bold" onClick={() => setShowQuote(true)}>
          Get Quote — {formatCurrency(grandTotal)}
        </button>

        {/* ─── STYLE SECTION ────────────────── */}
        <AccordionSection
          title="Style"
          subtitle={openSection !== "style" ? selectedStyle?.name : null}
          isOpen={openSection === "style"}
          onToggle={() => toggleSection("style")}
        >
          <p className="text-muted small mb-3">
            Select a style below to get started.
          </p>
          <div className="row row-cols-2 g-2">
            {styles.map((style) => (
              <div key={style.style_id} className="col">
                <div
                  className={`card h-100 text-center p-2 ${selectedStyleId === style.style_id ? "border-primary border-2" : ""}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelectedStyleId(style.style_id)}
                >
                  <div className="card-body p-1">
                    <AppIcon icon="building" className="fs-4 d-block mb-1" />
                    <div className="small fw-semibold">{style.name}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </AccordionSection>

        {/* ─── SIZE SECTION ─────────────────── */}
        <AccordionSection
          title="Size"
          subtitle={openSection !== "size" ? sizeLabel : null}
          isOpen={openSection === "size"}
          onToggle={() => toggleSection("size")}
        >
          <p className="text-muted small mb-3">
            Select your preferred size below.
          </p>
          <div className="d-flex gap-2 flex-wrap">
            <DimensionSelect label="Width" value={width} options={widths} onChange={setWidth} />
            <DimensionSelect label="Length" value={length} options={lengths} onChange={setLength} />
            <DimensionSelect label="Leg Height" value={height} options={heights} onChange={setHeight} />
          </div>
          {basePrice > 0 && (
            <div className="mt-3 text-end">
              <span className="text-muted small">Base price: </span>
              <span className="fw-bold">{formatCurrency(basePrice)}</span>
            </div>
          )}
        </AccordionSection>

        {/* ─── SIDES & ENDS SECTION ─────────── */}
        {panelFeature && (
          <AccordionSection
            title="Sides & Ends"
            subtitle={openSection !== "sides" ? wallModeLabel : null}
            isOpen={openSection === "sides"}
            onToggle={() => toggleSection("sides")}
          >
            <p className="text-muted small mb-3">
              Add panels to your building, and change options for each side.
            </p>
            <div className="mb-3">
              {[
                { key: "open", label: "Fully Open" },
                { key: "enclosed", label: "Fully Enclosed" },
                { key: "gable", label: "Gable Ends" },
                { key: "custom", label: "Customize by Wall" },
              ].map(({ key, label }) => (
                <div key={key} className="form-check">
                  <input className="form-check-input" type="radio" name="wallMode" id={`mode-${key}`}
                    checked={wallMode === key} onChange={() => applyMode(key)} />
                  <label className="form-check-label" htmlFor={`mode-${key}`}>{label}</label>
                </div>
              ))}
            </div>
            {wallMode === "custom" && (
              <div className="mt-3">
                {panelLocations
                  .filter((loc) => loc.feature_id === panelFeature.feature_id)
                  .map((loc) => {
                    const opts = panelOptions.filter(
                      (o) => o.feature_id === panelFeature.feature_id && o.location_type === loc.location_type
                    );
                    const selectedOptId = wallSelections[loc.location_id];
                    const selectedOpt = opts.find((o) => o.option_id === selectedOptId);
                    const wallPrice = selectedOpt ? calcPanelOptionPrice(selectedOpt, width, length) : 0;
                    return (
                      <div key={loc.location_id} className="mb-3">
                        <label className="form-label small fw-semibold mb-1">{loc.name}</label>
                        <div className="d-flex align-items-center gap-2">
                          <select className="form-select form-select-sm" value={selectedOptId ?? ""}
                            onChange={(e) => setWallSelections((prev) => ({ ...prev, [loc.location_id]: Number(e.target.value) }))}>
                            {opts.map((o) => <option key={o.option_id} value={o.option_id}>{o.name}</option>)}
                          </select>
                          {wallPrice > 0 && <span className="text-muted small text-nowrap">+{formatCurrency(wallPrice)}</span>}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
            {panelPrice > 0 && (
              <div className="mt-2 text-end border-top pt-2">
                <span className="text-muted small">Total: </span>
                <span className="fw-bold">{formatCurrency(panelPrice)}</span>
              </div>
            )}
          </AccordionSection>
        )}

        {/* ─── OTHER FEATURE SECTIONS ───────── */}
        {categories.map((cat) => {
          const catFeatures = otherFeatures.filter((f) => f.category === cat);
          const catKey = cat.toLowerCase().replace(/\s+/g, "-");
          return (
            <AccordionSection key={cat} title={cat} isOpen={openSection === catKey} onToggle={() => toggleSection(catKey)}>
              {catFeatures.map((feature) => (
                <FeatureSelector
                  key={feature.feature_id}
                  feature={feature}
                  rates={rates}
                  options={options}
                  onUpdate={(item) => updateAddOn(feature.feature_id, item)}
                  buildingWidth={width}
                  buildingLength={length}
                />
              ))}
            </AccordionSection>
          );
        })}

        {/* ─── DOORS & WINDOWS SECTION ──────── */}
        {doorWindowFeature && (
          <AccordionSection
            title="Doors & Windows"
            subtitle={openSection !== "doors" ? `${Object.values(doorWindowSelections).flat().length} items` : null}
            isOpen={openSection === "doors"}
            onToggle={() => { toggleSection("doors"); setHighlightedWall(openSection === "doors" ? null : activeWall); }}
          >
            <p className="text-muted small mb-3">
              Select a wall, then add items. Multiple items per wall allowed.
            </p>
            <div className="d-flex gap-1 mb-3">
              {["left", "back", "right", "front"].map((wall) => (
                <button key={wall} className={`btn btn-sm ${activeWall === wall ? "btn-dark" : "btn-outline-secondary"}`}
                  onClick={() => { setActiveWall(wall); setHighlightedWall(wall); }}>
                  {wall.charAt(0).toUpperCase() + wall.slice(1)} Wall
                </button>
              ))}
            </div>
            <div className="mb-3">
              <div className="text-muted small mb-2 fw-semibold">Add Items to Wall</div>
              <div className="d-flex flex-wrap gap-2">
                {["door", "window", "frameout", "rollup_door", "vent"].map((type) => {
                  const items = doorWindowItems.filter((i) => i.item_type === type);
                  if (items.length === 0) return null;
                  const label = type === "rollup_door" ? "Rollup Door" : type.charAt(0).toUpperCase() + type.slice(1);
                  return (
                    <div key={type} className="dropdown">
                      <button className="btn btn-outline-primary btn-sm dropdown-toggle" data-bs-toggle="dropdown">
                        + {label}
                      </button>
                      <ul className="dropdown-menu">
                        {items.map((item) => (
                          <li key={item.item_id}>
                            <button className="dropdown-item small" onClick={() => {
                              setDoorWindowSelections((prev) => ({
                                ...prev,
                                [activeWall]: [...(prev[activeWall] || []), { item_id: item.item_id, name: item.name, price: item.price }]
                              }));
                            }}>
                              {item.name} — {formatCurrency(item.price)}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Items on current wall */}
            {(doorWindowSelections[activeWall] || []).length > 0 && (
              <div>
                <div className="text-muted small mb-1 fw-semibold">Items on {activeWall} wall:</div>
                {doorWindowSelections[activeWall].map((item, idx) => (
                  <div key={idx} className="d-flex justify-content-between align-items-center mb-1 ps-2 border-start border-2">
                    <span className="small">{item.name}</span>
                    <div className="d-flex align-items-center gap-2">
                      <span className="small fw-bold">{formatCurrency(item.price)}</span>
                      <button className="btn btn-sm btn-link text-danger p-0" onClick={() => {
                        setDoorWindowSelections((prev) => {
                          const list = [...(prev[activeWall] || [])];
                          list.splice(idx, 1);
                          return { ...prev, [activeWall]: list };
                        });
                      }}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {doorWindowTotal > 0 && (
              <div className="mt-2 text-end border-top pt-2">
                <span className="text-muted small">Total: </span>
                <span className="fw-bold">{formatCurrency(doorWindowTotal)}</span>
              </div>
            )}
          </AccordionSection>
        )}

        {/* ─── COLORS SECTION ─────────────────── */}
        {colorFeature && colorGroups.length > 0 && (
          <AccordionSection
            title="Colors"
            isOpen={openSection === "colors"}
            onToggle={() => toggleSection("colors")}
          >
            <p className="text-muted small mb-3">
              Colors are approximate. Select colors for each part of your building.
            </p>
            {colorGroups.map((group) => {
              const groupOptions = colorOptions.filter((o) => o.color_group_id === group.color_group_id);
              const selectedOptId = colorSelections[group.color_group_id];
              const selectedOpt = groupOptions.find((o) => o.color_option_id === selectedOptId);
              return (
                <div key={group.color_group_id} className="mb-3">
                  <div className="small fw-semibold mb-1">
                    {group.name}: <span className="text-muted fw-normal">{selectedOpt?.name ?? "None"}</span>
                  </div>
                  <div className="d-flex flex-wrap gap-1">
                    {groupOptions.map((opt) => (
                      <div
                        key={opt.color_option_id}
                        title={`${opt.name}${Number(opt.upcharge) > 0 ? ` (+${formatCurrency(opt.upcharge)})` : ""}`}
                        style={{
                          width: 28, height: 28, borderRadius: "50%", cursor: "pointer",
                          background: opt.hex_code,
                          border: selectedOptId === opt.color_option_id ? "3px solid var(--psb-brand)" : "2px solid var(--psb-border)",
                          boxShadow: selectedOptId === opt.color_option_id ? "0 0 0 2px var(--psb-brand)" : "none",
                        }}
                        onClick={() => setColorSelections((prev) => ({ ...prev, [group.color_group_id]: opt.color_option_id }))}
                      />
                    ))}
                  </div>
                  {selectedOpt && Number(selectedOpt.upcharge) > 0 && (
                    <div className="text-muted small mt-1">Premium: +{formatCurrency(selectedOpt.upcharge)}</div>
                  )}
                </div>
              );
            })}
            {colorUpchargeTotal > 0 && (
              <div className="mt-2 text-end border-top pt-2">
                <span className="text-muted small">Color upcharges: </span>
                <span className="fw-bold">{formatCurrency(colorUpchargeTotal)}</span>
              </div>
            )}
          </AccordionSection>
        )}

        {/* ─── DELIVERY / REGION SECTION ────── */}
        <AccordionSection
          title="Delivery Location"
          subtitle={selectedRegion ? selectedRegion.name : null}
          isOpen={openSection === "delivery"}
          onToggle={() => toggleSection("delivery")}
        >
          <p className="text-muted small mb-3">
            Select your state to see region-adjusted pricing.
          </p>
          <select
            className="form-select form-select-sm"
            value={selectedRegion?.region_id ?? ""}
            onChange={(e) => {
              const rid = Number(e.target.value);
              setSelectedRegion(regions.find((r) => r.region_id === rid) ?? null);
            }}
          >
            <option value="">— No region (default pricing) —</option>
            {regions.map((r) => (
              <option key={r.region_id} value={r.region_id}>
                {r.name} ({r.state_code}) {Number(r.multiplier) !== 1 ? `×${r.multiplier}` : ""}
              </option>
            ))}
          </select>
          {regionAdjustment !== 0 && (
            <div className="mt-2 text-muted small">
              Region adjustment: <strong>{regionAdjustment > 0 ? "+" : ""}{formatCurrency(regionAdjustment)}</strong>
            </div>
          )}
        </AccordionSection>
      </div>

      {/* ─── QUOTE MODAL ───────────────────── */}
      {showQuote && (
        <div className="modal d-block" tabIndex="-1" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setShowQuote(false)}>
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Quote Summary</h5>
                <button type="button" className="btn-close" onClick={() => setShowQuote(false)}></button>
              </div>
              <div className="modal-body">
                <div className="text-muted small mb-3">{selectedStyle?.name} — {sizeLabel}</div>
                <QuoteLine label="Base Structure" detail={sizeLabel} price={basePrice} />
                {panelPrice > 0 && <QuoteLine label="Sides & Ends" detail={wallModeLabel} price={panelPrice} />}
                {doorWindowTotal > 0 && <QuoteLine label="Doors & Windows" detail={`${Object.values(doorWindowSelections).flat().length} items`} price={doorWindowTotal} />}
                {colorUpchargeTotal > 0 && <QuoteLine label="Color Upgrades" price={colorUpchargeTotal} />}
                {Object.entries(addOnItems).map(([fId, item]) => (
                  <QuoteLine key={fId} label={item.featureName} detail={item.description} price={item.price} />
                ))}
                {regionAdjustment !== 0 && (
                  <QuoteLine label="Region Adjustment" detail={selectedRegion?.name} price={regionAdjustment} />
                )}
                <hr />
                <div className="d-flex justify-content-between">
                  <span className="fw-bold">Estimated Total</span>
                  <span className="fw-bold text-primary fs-4">{formatCurrency(grandTotal)}</span>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowQuote(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ACCORDION SECTION ─────────────────────────────────────

function AccordionSection({ title, subtitle, isOpen, onToggle, children }) {
  return (
    <div className="card mb-2">
      <div className="card-header d-flex justify-content-between align-items-center" style={{ cursor: "pointer" }} onClick={onToggle}>
        <div>
          <h6 className="mb-0">{title}</h6>
          {subtitle && <span className="text-muted small">{subtitle}</span>}
        </div>
        <span className="fs-5">{isOpen ? "−" : "+"}</span>
      </div>
      {isOpen && <div className="card-body">{children}</div>}
    </div>
  );
}

// ─── DIMENSION SELECT ──────────────────────────────────────

function DimensionSelect({ label, value, options, onChange }) {
  return (
    <div>
      <label className="form-label small fw-semibold mb-1">{label}</label>
      <select className="form-select form-select-sm" style={{ width: 100 }} value={value}
        onChange={(e) => onChange(Number(e.target.value))}>
        {options.map((v) => <option key={v} value={v}>{v}&apos;</option>)}
      </select>
    </div>
  );
}

// ─── QUOTE LINE ────────────────────────────────────────────

function QuoteLine({ label, detail, price }) {
  return (
    <div className="d-flex justify-content-between mb-2">
      <div>
        <div className="fw-semibold small">{label}</div>
        {detail && <div className="text-muted" style={{ fontSize: "0.75rem" }}>{detail}</div>}
      </div>
      <span className="fw-bold small">{formatCurrency(price)}</span>
    </div>
  );
}

// ─── FEATURE SELECTOR ──────────────────────────────────────

function FeatureSelector({ feature, rates, options, onUpdate, buildingWidth, buildingLength }) {
  switch (feature.pricing_type) {
    case "RATE":
      return <RateSelector feature={feature} rates={rates} onUpdate={onUpdate} />;
    case "FIXED":
      return <FixedSelector feature={feature} options={options} onUpdate={onUpdate} />;
    case "PER_WALL":
      return <PerWallSelector feature={feature} rates={rates} onUpdate={onUpdate} buildingWidth={buildingWidth} buildingLength={buildingLength} />;
    default:
      return null;
  }
}

// ─── RATE SELECTOR ─────────────────────────────────────────

function RateSelector({ feature, rates, onUpdate }) {
  const fId = feature.feature_id;
  const rateRow = rates.find((r) => r.feature_id === fId);
  const [enabled, setEnabled] = useState(false);
  const [measurement, setMeasurement] = useState("");

  const unitLabel = rateRow?.unit === "sqft" ? "sq ft" : "linear ft";

  const handleChange = (en, val) => {
    if (!en || !rateRow) { onUpdate(null); return; }
    const parsed = parseFloat(val);
    if (isNaN(parsed) || parsed <= 0) { onUpdate(null); return; }
    const price = parsed * Number(rateRow.rate);
    onUpdate({ featureName: feature.name, description: `${parsed} ${unitLabel} × $${rateRow.rate}/${unitLabel}`, price });
  };

  return (
    <div className="mb-3 ps-2 border-start border-2">
      <div className="form-check mb-2">
        <input className="form-check-input" type="checkbox" checked={enabled}
          onChange={(e) => { setEnabled(e.target.checked); handleChange(e.target.checked, measurement); }}
          id={`chk-${fId}`} />
        <label className="form-check-label fw-semibold" htmlFor={`chk-${fId}`}>{feature.name}</label>
        {feature.description && <div className="text-muted small">{feature.description}</div>}
      </div>
      {enabled && rateRow && (
        <div className="d-flex align-items-center gap-2 mb-2">
          <input type="number" min="0" step="0.5" className="form-control form-control-sm" style={{ width: 120 }}
            placeholder={unitLabel} value={measurement}
            onChange={(e) => { setMeasurement(e.target.value); handleChange(true, e.target.value); }} />
          <span className="text-muted small">{unitLabel} × ${rateRow.rate}</span>
        </div>
      )}
    </div>
  );
}

// ─── FIXED SELECTOR ────────────────────────────────────────

function FixedSelector({ feature, options: allOptions, onUpdate }) {
  const fId = feature.feature_id;
  const featureOptions = allOptions.filter((o) => o.feature_id === fId);
  const [selectedId, setSelectedId] = useState(null);

  const handleSelect = (optionId) => {
    const newId = optionId === selectedId ? null : optionId;
    setSelectedId(newId);
    if (!newId) { onUpdate(null); return; }
    const opt = featureOptions.find((o) => o.option_id === newId);
    if (!opt) { onUpdate(null); return; }
    onUpdate({ featureName: feature.name, description: opt.name, price: Number(opt.price) });
  };

  return (
    <div className="mb-3 ps-2 border-start border-2">
      <div className="fw-semibold mb-1">{feature.name}</div>
      {feature.description && <div className="text-muted small mb-2">{feature.description}</div>}
      <div className="d-flex flex-column gap-1">
        {featureOptions.map((opt) => (
          <div key={opt.option_id} className="form-check">
            <input className="form-check-input" type="radio" name={`fixed-${fId}`}
              checked={selectedId === opt.option_id} onChange={() => handleSelect(opt.option_id)}
              id={`opt-${opt.option_id}`} />
            <label className="form-check-label d-flex justify-content-between w-100" htmlFor={`opt-${opt.option_id}`}>
              <span>{opt.name}</span>
              <span className="fw-bold">{formatCurrency(opt.price)}</span>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PER_WALL SELECTOR ─────────────────────────────────────

function PerWallSelector({ feature, rates, onUpdate, buildingWidth, buildingLength }) {
  const fId = feature.feature_id;
  const rateRow = rates.find((r) => r.feature_id === fId);
  const [selected, setSelected] = useState({ roof: false, left: false, right: false, front: false, back: false });

  const calcPrice = (sel) => {
    if (!rateRow) return 0;
    const rate = Number(rateRow.rate);
    let total = 0;
    if (sel.roof) total += (buildingWidth + buildingLength) * 2 * rate;
    if (sel.left) total += buildingLength * rate;
    if (sel.right) total += buildingLength * rate;
    if (sel.front) total += buildingWidth * rate;
    if (sel.back) total += buildingWidth * rate;
    return total;
  };

  const handleToggle = (wall) => {
    const next = { ...selected, [wall]: !selected[wall] };
    setSelected(next);
    const price = calcPrice(next);
    const enabledWalls = Object.entries(next).filter(([, v]) => v).map(([k]) => k);
    if (enabledWalls.length === 0) { onUpdate(null); return; }
    onUpdate({ featureName: feature.name, description: enabledWalls.join(", "), price });
  };

  return (
    <div className="mb-3 ps-2 border-start border-2">
      <div className="fw-semibold mb-1">{feature.name}</div>
      {feature.description && <div className="text-muted small mb-2">{feature.description}</div>}
      {["roof", "left", "front", "right", "back"].map((wall) => (
        <div key={wall} className="form-check">
          <input className="form-check-input" type="checkbox" checked={selected[wall]}
            onChange={() => handleToggle(wall)} id={`pw-${fId}-${wall}`} />
          <label className="form-check-label" htmlFor={`pw-${fId}-${wall}`}>
            {wall.charAt(0).toUpperCase() + wall.slice(1)}{wall === "roof" ? "" : " Wall"}
          </label>
        </div>
      ))}
      {rateRow && <div className="text-muted small mt-1">${rateRow.rate}/linear ft</div>}
    </div>
  );
}
