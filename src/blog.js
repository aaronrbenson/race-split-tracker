import { marked } from 'marked';
import { initMap } from './map.js';
import { parseGpxToTrack } from './gpx.js';

const GPX_URL = '/Rocky_Raccoon_100%20for%20Publication.gpx';
const MD_URL = '/blog/rocky-raccoon-100k-race-report.md';

let blogMapApi = null;

async function initBlogMap() {
  const container = document.getElementById('blog-map');
  if (!container) return;
  blogMapApi = initMap(container, { background: true });
  try {
    const res = await fetch(GPX_URL);
    if (!res.ok) return;
    const xml = await res.text();
    const track = parseGpxToTrack(xml);
    blogMapApi.setTrack(track);
  } catch (_) { /* map loads without track */ }
}

function wrapSections(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  const result = document.createDocumentFragment();
  let currentSection = null;

  function flush() {
    if (currentSection && currentSection.childNodes.length) {
      result.appendChild(currentSection);
    }
    currentSection = document.createElement('section');
    currentSection.className = 'blog-section';
  }

  flush();
  const nodes = Array.from(tmp.childNodes);

  let isFirst = true;
  for (const node of nodes) {
    if (node.nodeType === 1 && node.tagName === 'HR') {
      flush();
      continue;
    }
    if (isFirst && node.nodeType === 1 && (node.tagName === 'H1' || node.tagName === 'H2')) {
      currentSection.classList.add('blog-hero-section');
    }
    currentSection.appendChild(node);
    if (node.nodeType === 1) isFirst = false;
  }
  flush();

  return result;
}

async function renderPost() {
  const contentEl = document.getElementById('blog-content');
  if (!contentEl) return;
  try {
    const res = await fetch(MD_URL);
    if (!res.ok) throw new Error('Failed to load post');
    const md = await res.text();
    const html = marked.parse(md);
    contentEl.innerHTML = '';
    contentEl.appendChild(wrapSections(html));
    observeSections();
  } catch (e) {
    contentEl.innerHTML = '<p class="blog-error">Could not load the post.</p>';
  }
}

function observeSections() {
  const sections = document.querySelectorAll('.blog-section');
  if (!sections.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('blog-section-visible');
        }
      }
    },
    { threshold: 0.08, rootMargin: '0px 0px -60px 0px' },
  );

  sections.forEach((s) => observer.observe(s));
}

function initParallax() {
  const mapLayer = document.getElementById('blog-map-layer');
  if (!mapLayer) return;
  let ticking = false;

  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const scrollY = window.scrollY;
      const vh = window.innerHeight;
      // Map layer stays fixed so the map is always visible as parallax bg (no translate)
      const trackFade = Math.max(0, 1 - scrollY / (vh * 0.45));
      if (blogMapApi?.setTrackOpacity) blogMapApi.setTrackOpacity(trackFade * 0.55);
      ticking = false;
    });
  });
}

initBlogMap();
renderPost();
initParallax();
