// Hash routes work on the local Vite server and static hosting without server rewrites.
export const PAGES = {
  home: {path:'/', label:'Home'},
  scenarios: {path:'/scenarios', label:'Scenarios'},
  algorithm: {path:'/algorithm', label:'Algorithm'},
  live: {path:'/live', label:'Live Session'},
  system: {path:'/system', label:'System'},
  results: {path:'/results', label:'Results & History'},
  study: {path:'/performance-study', label:'Performance Study'},
};

export function routeHref(page, scenarioId) {
  if(page==='scenario' && scenarioId) return `#/scenarios/${encodeURIComponent(scenarioId)}`;
  if(!PAGES[page]) throw new Error('Unknown page');
  return `#${PAGES[page].path}`;
}

export function resolveRoute(hash) {
  const path=(hash.replace(/^#/, '') || '/').replace(/\/$/, '') || '/';
  const page=Object.keys(PAGES).find(key=>PAGES[key].path===path);
  if(page) return {page};
  const match=path.match(/^\/scenarios\/([^/]+)$/);
  if(match) {
    try {return {page:'scenario',scenarioId:decodeURIComponent(match[1])};}
    catch {return {page:'not-found'};}
  }
  return {page:'not-found'};
}
