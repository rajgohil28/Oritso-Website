let r;
var s = (o) => {
    if (!r) {
        const n = o.forwardRef(({color: t = "currentColor", size: e = 24, ...i}, l) => {
            return o.createElement("svg", {ref: l, xmlns: "http://www.w3.org/2000/svg", width: e, height: e, viewBox: "0 0 24 24", fill: "none", stroke: t, strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", ...i}, o.createElement("path", {d: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"}), o.createElement("polyline", {points: "9 22 9 12 15 12 15 22"}));
        });
        n.displayName = "Home",r = n;
    }
    return r;
};
const __FramerMetadata__ = {exports: {default: {type: "reactComponent", slots: [], annotations: {framerContractVersion: "1"}}, __FramerMetadata__: {type: "variable"}}};
export { __FramerMetadata__, s as default };