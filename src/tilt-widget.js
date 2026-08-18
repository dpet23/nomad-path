import {Widget} from '@deck.gl/core';

/**
 * A vertical slider for camera pitch.
 *
 * Tilting by gesture needs three fingers (two are claimed by pinch-zoom), which
 * the operating system may take for itself and which nobody discovers unaided.
 * A pointer alternative is what WCAG 2.5.1 asks for in exchange for a multipoint
 * gesture, and it doubles as the only reading on screen of how tilted the camera
 * currently is.
 *
 * The angles come from the caller, which is also what configures the controller,
 * so the slider cannot disagree with the camera about how far it tilts.
 *
 * Built from a native range input rather than deck's `_RangeInput`: that one is
 * a scrollbar, reporting `role="scrollbar"` and a `[start, end]` pair sized to a
 * proportion of scrollable content, none of which describes an angle.
 */
export class TiltWidget extends Widget {
  constructor(props = {}) {
    super(props);
    this.className = 'nomad-widget-tilt';
    this.placement = 'top-right';
    this.viewports = {};
    this.setProps(this.props);
  }

  setProps(props) {
    this.placement = props.placement ?? this.placement;
    this.viewId = props.viewId ?? this.viewId;
    super.setProps(props);
  }

  onRenderHTML(rootElement) {
    if (!this.input) this.build(rootElement);
    // The camera is the truth, except while a finger is on the slider: writing
    // a step-rounded value back mid-drag makes the thumb stutter against itself.
    if (!this.dragging) this.show(this.pitch());
  }

  onViewportChange(viewport) {
    if (!viewport.equals(this.viewports[viewport.id])) {
      this.viewports[viewport.id] = viewport;
      this.updateHTML();
    }
  }

  /** Current pitch in degrees, from whichever viewport this widget is bound to. */
  pitch() {
    const viewId = this.viewId || Object.values(this.viewports)[0]?.id;
    return this.viewports[viewId]?.pitch ?? 0;
  }

  build(rootElement) {
    const {minPitchDegrees, maxPitchDegrees, stepDegrees, label} = this.props;

    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'nomad-tilt-slider';
    input.min = String(minPitchDegrees);
    input.max = String(maxPitchDegrees);
    input.step = String(stepDegrees);
    input.title = label;
    input.setAttribute('aria-label', label);

    const readout = document.createElement('div');
    readout.className = 'nomad-tilt-readout';
    // The input announces the same angle through aria-valuetext, and reading it
    // out twice would only make the slider more tedious to move.
    readout.setAttribute('aria-hidden', 'true');

    input.addEventListener('input', () => this.apply(Number(input.value)));
    // Pointer capture on the thumb means the browser can deliver pointerup
    // somewhere other than the input; the window is where it reliably lands.
    input.addEventListener('pointerdown', () => {
      this.dragging = true;
      const done = () => (this.dragging = false);
      window.addEventListener('pointerup', done, {once: true});
      window.addEventListener('pointercancel', done, {once: true});
    });

    rootElement.append(readout, input);
    this.input = input;
    this.readout = readout;
  }

  show(degrees) {
    const rounded = Math.round(degrees);
    this.input.value = String(rounded);
    this.input.setAttribute('aria-valuetext', `${rounded} degrees`);
    this.readout.textContent = `${rounded}°`;
  }

  apply(degrees) {
    this.readout.textContent = `${degrees}°`;
    for (const viewport of Object.values(this.viewports)) {
      const viewId = this.viewId || viewport.id;
      this.setViewState(viewId, {...this.getViewState(viewId), pitch: degrees});
    }
  }
}

TiltWidget.defaultProps = {
  ...Widget.defaultProps,
  id: 'tilt',
  placement: 'top-right',
  viewId: null,
  label: 'Tilt'
};
