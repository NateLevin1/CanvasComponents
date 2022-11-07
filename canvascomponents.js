// prevent multiple initializations
if(window.CANVAS_COMPONENTS_LOADED) throw new Error("Already loaded CanvasComponents.");
window.CANVAS_COMPONENTS_LOADED = true;

let components = [/*${CANVAS_COMPONENTS}*/];
console.log(components);
