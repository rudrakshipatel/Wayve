/** Web: behave like a native app shell — the document itself never scrolls. */
const style = document.createElement("style");
style.textContent = `html, body, #root { height: 100%; overflow: hidden; overscroll-behavior: none; }`;
document.head.appendChild(style);

export {};
