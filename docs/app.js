// Configuration for repository information
import { GITHUB_TOKEN } from './config.js';
const queryParams = new URLSearchParams(window.location.search);
const globalConfig = window.HOLIDAY_CONFIG || {};
const envConfig = (typeof window !== 'undefined' && (window.ENV || window.env)) || {};
const owner = 'MadGodNerevar';
const repo = 'holiday-adventures';

// Access key for Unsplash API (required for destination images)
const unsplashAccessKey =
  queryParams.get('unsplashKey') ||
  globalConfig.unsplashAccessKey ||
  envConfig.UNSPLASH_ACCESS_KEY ||
  '';

let itineraryMap;
let itineraryMarkers = [];

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function initTheme() {
  const root = document.documentElement;
  const toggle = document.getElementById('dark-mode-toggle');
  const storedTheme = localStorage.getItem('theme');
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const currentTheme = storedTheme || (media.matches ? 'dark' : 'light');
  root.setAttribute('data-theme', currentTheme);
  if (toggle) toggle.textContent = currentTheme === 'dark' ? '☀️' : '🌙';

  media.addEventListener('change', e => {
    if (!localStorage.getItem('theme')) {
      const newTheme = e.matches ? 'dark' : 'light';
      root.setAttribute('data-theme', newTheme);
      if (toggle) toggle.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    }
  });

  if (toggle) {
    toggle.addEventListener('click', () => {
      const theme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
      toggle.textContent = theme === 'dark' ? '☀️' : '🌙';
    });
  }
}

function getHolidayToken() {
  return GITHUB_TOKEN || localStorage.getItem('HOLIDAY_TOKEN') || '';
}

async function loadProjectDetails(project) {
  const descEl = document.getElementById('project-description');
  const milestonesEl = document.getElementById('project-milestones');
  const issuesEl = document.getElementById('project-issues');
  if (descEl) descEl.textContent = '';
  if (milestonesEl) milestonesEl.innerHTML = '';
  if (issuesEl) issuesEl.innerHTML = '';
  try {
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${project}`);
    if (repoRes.ok && descEl) {
      const repoData = await repoRes.json();
      descEl.textContent = repoData.description || 'No description provided';
    }

    const milestoneRes = await fetch(`https://api.github.com/repos/${owner}/${project}/milestones`);
    if (milestoneRes.ok && milestonesEl) {
      const milestones = await milestoneRes.json();
      if (milestones.length) {
        milestones.forEach(m => {
          const li = document.createElement('li');
          li.textContent = `${m.title} (${m.state})`;
          milestonesEl.appendChild(li);
        });
      } else {
        const li = document.createElement('li');
        li.textContent = 'No milestones found';
        milestonesEl.appendChild(li);
      }
    }

    const issuesRes = await fetch(`https://api.github.com/repos/${owner}/${project}/issues`);
    if (issuesRes.ok && issuesEl) {
      const issues = await issuesRes.json();
      if (issues.length) {
        issues.forEach(issue => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = issue.html_url;
          a.textContent = issue.title;
          a.target = '_blank';
          li.appendChild(a);
          issuesEl.appendChild(li);
        });
      } else {
        const li = document.createElement('li');
        li.textContent = 'No issues found';
        issuesEl.appendChild(li);
      }
    }
  } catch (err) {
    console.error('loadProjectDetails:', err);
  }
}

async function loadTasks(headers, projectId) {
  try {
    const listEl = document.getElementById('tasks-list');
    if (!listEl) {
      console.warn('Tasks list element not found');
      return;
    }
    listEl.innerHTML = '';

    const token = headers.Authorization ? headers.Authorization.split(' ')[1] : null;
    const gqlHeaders = token
      ? { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' };

    if (projectId) {
      const query = `
        query($projectId: ID!) {
          node(id: $projectId) {
            ... on ProjectV2 {
              items(first: 100) {
                nodes {
                  content {
                    ... on Issue { title url }
                  }
                }
              }
            }
          }
        }
      `;
      const res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: gqlHeaders,
        body: JSON.stringify({ query, variables: { projectId } })
      });
      if (!res.ok) {
        const li = document.createElement('li');
        li.textContent = 'No tasks found';
        listEl.appendChild(li);
        return;
      }

      const data = await res.json();
      const items = data?.data?.node?.items?.nodes || [];
      items
        .map(item => item.content)
        .filter(c => c && c.url)
        .forEach(task => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = task.url;
          a.textContent = task.title;
          a.target = '_blank';
          li.appendChild(a);
          listEl.appendChild(li);
        });
      return;
    }

    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, { headers });
    if (!res.ok) {
      const li = document.createElement('li');
      li.textContent = 'No tasks found';
      listEl.appendChild(li);
      return;
    }
    const tasks = await res.json();
    tasks.forEach(task => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = task.html_url;
      a.textContent = task.title;
      a.target = '_blank';
      li.appendChild(a);
      listEl.appendChild(li);
    });
  } catch (err) {
    const listEl = document.getElementById('tasks-list');
    if (listEl) {
      const li = document.createElement('li');
      li.textContent = 'Unable to load tasks';
      listEl.appendChild(li);
    }
    console.error('loadTasks:', err && err.message ? err.message : err);
  }
}

async function loadProjectBoard(headers, projectId) {
  const boardEl = document.getElementById('project-columns');
  if (!boardEl) {
    console.warn('Project columns element not found');
    return;
  }
  boardEl.innerHTML = '';
  try {
    const token = headers.Authorization ? headers.Authorization.split(' ')[1] : null;
    const gqlHeaders = token
      ? { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' };
    const query = `
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          projectsV2(first: 10) {
            nodes {
              id
              title
              items(first: 50) {
                nodes {
                  content {
                    ... on Issue { title url }
                    ... on PullRequest { title url }
                    ... on DraftIssue { title }
                  }
                  fieldValues(first: 10) {
                    nodes {
                      ... on ProjectV2ItemFieldSingleSelectValue {
                        name
                        field { name }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;
      const projectRes = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: gqlHeaders,
        body: JSON.stringify({ query, variables: { id: projectId } })
      });
      if (!projectRes.ok) throw new Error('Failed to fetch project');
      const projectData = await projectRes.json();
      const node = projectData?.data?.node;
      projects = node ? [node] : [];
    } else {
      const query = `
        query($owner: String!, $repo: String!) {
          repository(owner: $owner, name: $repo) {
            projectsV2(first: 10) {
              nodes {
                id
                title
                items(first: 50) {
                  nodes {
                    content {
                      ... on Issue { title url }
                      ... on PullRequest { title url }
                      ... on DraftIssue { title }
                    }
                    fieldValues(first: 10) {
                      nodes {
                        ... on ProjectV2ItemFieldSingleSelectValue {
                          name
                          field { name }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;
      const projectRes = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: gqlHeaders,
        body: JSON.stringify({ query, variables: { owner, repo } })
      });
      if (!projectRes.ok) throw new Error('Failed to fetch projects');
      const projectData = await projectRes.json();
      projects = projectData?.data?.repository?.projectsV2?.nodes || [];
    }
    if (!projects.length) {
      boardEl.textContent = 'No projects found';
      if (!projectId) populateProjectSelector([], headers);
      return;
    }
    for (const project of projects) {
      const projectDiv = document.createElement('div');
      projectDiv.className = 'project';
      projectDiv.dataset.id = project.id;
      const projectTitle = document.createElement('h3');
      projectTitle.textContent = project.title;
      projectDiv.appendChild(projectTitle);

      const columnsContainer = document.createElement('div');
      columnsContainer.className = 'columns';
      const columnMap = {};
      project.items.nodes.forEach(item => {
        let status = 'No Status';
        item.fieldValues.nodes.forEach(fv => {
          if (fv.field && fv.field.name === 'Status' && fv.name) {
            status = fv.name;
          }
        });
        columnMap[status] = columnMap[status] || [];
        columnMap[status].push(item);
      });

      Object.entries(columnMap).forEach(([status, items]) => {
        const columnDiv = document.createElement('div');
        columnDiv.className = 'column';
        const columnTitle = document.createElement('h4');
        columnTitle.textContent = status;
        columnDiv.appendChild(columnTitle);
        const ul = document.createElement('ul');
        items.forEach(item => {
          const li = document.createElement('li');
          if (item.content && item.content.url) {
            const link = document.createElement('a');
            link.href = item.content.url;
            link.textContent = item.content.title;
            link.target = '_blank';
            li.appendChild(link);
          } else if (item.content && item.content.title) {
            li.textContent = item.content.title;
          } else {
            li.textContent = 'Item';
          }
          ul.appendChild(li);
        });
        columnDiv.appendChild(ul);
        columnsContainer.appendChild(columnDiv);
      });

      projectDiv.appendChild(columnsContainer);
      boardEl.appendChild(projectDiv);
    }
    populateProjectSelector(projects);
    populateTaskProjectSelector(projects);
  } catch (err) {
    boardEl.textContent = 'Projects could not be loaded.';
    console.error(err);
  }
}

function populateProjectSelector(projects, headers) {
  const select = document.getElementById('project-select');
  if (!select) return;
  select.innerHTML = '<option value="">All Projects</option>';
  projects.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.title;
    select.appendChild(opt);
  });
  select.onchange = e => {
    const value = e.target.value;
    document.querySelectorAll('#project-board .project').forEach(div => {
      div.style.display = !value || div.dataset.id === value ? '' : 'none';
    });
    loadTasks(headers, value || null);
  });
}

function populateTaskProjectSelector(projects) {
  const select = document.getElementById('task-project');
  if (!select) return;
  select.innerHTML = '<option value="">Select Project</option>';
  projects.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.title;
    select.appendChild(opt);
  });
}

async function loadHolidayBits(headers) {
  const container = document.getElementById('holiday-bits-container');
  if (!container) return;
  container.innerHTML = '';
  const sections = [
    { path: 'destinations', title: 'Destinations' },
    { path: 'ideas', title: 'Ideas' },
    { path: 'packing-lists', title: 'Packing Lists' },
    { path: 'itinerary-templates', title: 'Itinerary Templates' },
    { path: 'projects', title: 'Projects' }
  ];
  for (const { path, title } of sections) {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, { headers });

      if (res.status === 404) {
        const note = document.createElement('div');
        note.textContent = `No ${title} available`;
        container.appendChild(note);
        continue;
      }

      if (!res.ok) {
        console.warn(`Failed to load ${path}: ${res.status}`);
        continue;
      }

      const files = await res.json();
      const sectionDiv = document.createElement('div');
      const h3 = document.createElement('h3');
      h3.textContent = title;
      sectionDiv.appendChild(h3);
      const ul = document.createElement('ul');
      files.forEach(file => {
        if (file.type === 'file') {
          const li = document.createElement('li');
          const name = file.name.replace(/\.md$/, '').replace(/-/g, ' ');
          if (file.name.endsWith('.md')) {
            li.textContent = name;
          } else {
            const a = document.createElement('a');
            a.href = file.html_url;
            a.textContent = name;
            a.target = '_blank';
            li.appendChild(a);
          }
          ul.appendChild(li);
        }
      });
      sectionDiv.appendChild(ul);
      container.appendChild(sectionDiv);
    } catch (err) {
      console.warn(`Unable to load ${title}`, err);
    }
  }
}

async function geocodeDestination(dest) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(dest)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.length) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (err) {
    console.error('geocodeDestination:', err);
  }
  return null;
}

function initItineraryMap() {
  const mapEl = document.getElementById('itinerary-map');
  if (!mapEl || typeof L === 'undefined') return;
  itineraryMap = L.map(mapEl).setView([20, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(itineraryMap);
}

function resetItineraryMarkers() {
  if (!itineraryMap) return;
  itineraryMarkers.forEach(m => itineraryMap.removeLayer(m));
  itineraryMarkers = [];
}

function enableItineraryDrag(listEl, headers) {
  let dragged;
  listEl.addEventListener('dragstart', e => {
    dragged = e.target.closest('li');
    if (dragged) e.dataTransfer.effectAllowed = 'move';
  });
  listEl.addEventListener('dragover', e => {
    e.preventDefault();
    const target = e.target.closest('li');
    if (!target || target === dragged) return;
    const rect = target.getBoundingClientRect();
    const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
    listEl.insertBefore(dragged, next ? target.nextSibling : target);
  });
  listEl.addEventListener('drop', e => {
    e.preventDefault();
    updateDayOrder(listEl, headers);
  });
}

async function updateDayOrder(listEl, headers) {
  const items = Array.from(listEl.children);
  for (let i = 0; i < items.length; i++) {
    const li = items[i];
    const data = JSON.parse(li.dataset.body || '{}');
    data.day = i + 1;
    li.dataset.body = JSON.stringify(data);
    const summary = li.querySelector('summary');
    summary.textContent = `Day ${data.day}: ${li.dataset.destination}`;
    if (headers.Authorization) {
      await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${li.dataset.issue}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: JSON.stringify(data, null, 2) })
      }).catch(err => console.error('updateDayOrder:', err));
    }
  }
}

async function loadItinerary(headers) {
  const listEl = document.getElementById('itinerary-timeline');
  if (!listEl) return;
  listEl.innerHTML = '';
  resetItineraryMarkers();
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues?labels=itinerary&per_page=100`,
      { headers }
    );
    if (!res.ok) {
      listEl.textContent = 'No itinerary entries found.';
      return;
    }
    const items = await res.json();
    items.sort((a, b) => {
      const da = (() => {
        try { return JSON.parse(a.body).day; } catch (_) { return 0; }
      })() || 0;
      const db = (() => {
        try { return JSON.parse(b.body).day; } catch (_) { return 0; }
      })() || 0;
      return da - db;
    });
    for (const issue of items) {
      let data = {};
      try {
        data = issue.body ? JSON.parse(issue.body) : {};
      } catch (_) {
        data = {};
      }
      const day = data.day || items.indexOf(issue) + 1;
      const li = document.createElement('li');
      li.className = 'itinerary-day';
      li.draggable = true;
      li.dataset.issue = issue.number;
      li.dataset.destination = issue.title;
      li.dataset.body = JSON.stringify(data);
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = `Day ${day}: ${issue.title}`;
      details.appendChild(summary);
      const content = document.createElement('div');
      if (data.photo) {
        const img = document.createElement('img');
        img.src = data.photo;
        img.alt = issue.title;
        img.loading = 'lazy';
        content.appendChild(img);
      }
      const fields = [
        ['Activities', data.activities],
        ['Budget', data.budget],
        ['Notes', data.notes]
      ];
      fields.forEach(([label, val]) => {
        if (val) {
          const p = document.createElement('p');
          p.innerHTML = `<strong>${label}:</strong> ${val}`;
          content.appendChild(p);
        }
      });
      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => {
        const form = document.getElementById('itinerary-form');
        if (!form) return;
        document.getElementById('itinerary-issue-number').value = issue.number;
        document.getElementById('itinerary-day').value = data.day || '';
        document.getElementById('itinerary-destination').value = issue.title;
        document.getElementById('itinerary-activities').value = data.activities || '';
        document.getElementById('itinerary-budget').value = data.budget || '';
        document.getElementById('itinerary-photo').value = data.photo || '';
        document.getElementById('itinerary-notes').value = data.notes || '';
        form.scrollIntoView({ behavior: 'smooth' });
      });
      content.appendChild(editBtn);
      details.appendChild(content);
      li.appendChild(details);
      listEl.appendChild(li);
      if (itineraryMap) {
        if (data.lat && data.lng) {
          const marker = L.marker([data.lat, data.lng]).addTo(itineraryMap).bindPopup(issue.title);
          itineraryMarkers.push(marker);
        } else {
          const coords = await geocodeDestination(issue.title);
          if (coords) {
            data.lat = coords.lat;
            data.lng = coords.lng;
            li.dataset.body = JSON.stringify(data);
            const marker = L.marker([coords.lat, coords.lng]).addTo(itineraryMap).bindPopup(issue.title);
            itineraryMarkers.push(marker);
          }
        }
      }
    }
    if (itineraryMarkers.length && itineraryMap) {
      const group = L.featureGroup(itineraryMarkers);
      itineraryMap.fitBounds(group.getBounds().pad(0.2));
    }
    enableItineraryDrag(listEl, headers);
  } catch (err) {
    listEl.textContent = 'Unable to load itinerary.';
    console.error('loadItinerary:', err && err.message ? err.message : err);
  }
}

  function loadData() {
    const token = getHolidayToken();
    let headers = {};
    if (token) {
      // Fine-grained PATs start with `github_pat_`; otherwise assume classic PAT
      const isFineGrained = token.startsWith('github_pat_');
      headers = { Authorization: `${isFineGrained ? 'Bearer' : 'token'} ${token}` };
    }
    loadTasks(headers);
    loadProjectBoard(headers);
    loadHolidayBits(headers);
    loadItinerary(headers);
  }

function updateActiveNav() {
  const links = document.querySelectorAll('.main-nav a');
  let activeLink = null;
  links.forEach(link => {
    const section = document.querySelector(link.getAttribute('href'));
    if (section) {
      const rect = section.getBoundingClientRect();
      if (rect.top <= window.innerHeight / 2 && rect.bottom >= window.innerHeight / 2) {
        activeLink = link;
      }
    }
  });
  links.forEach(link => link.classList.toggle('active', link === activeLink));
}

function initAnimations() {
  if (!prefersReducedMotion() && window.gsap) {
    gsap.from('.main-nav a', { y: -20, opacity: 0, duration: 0.6, stagger: 0.1, ease: 'power2.out' });
    gsap.from('.hero-tagline', { y: 50, opacity: 0, duration: 1, ease: 'power2.out' });
    gsap.from('.hero-cta button', { y: 20, opacity: 0, duration: 0.6, stagger: 0.1, ease: 'power2.out' });
  }
}

function handleHeroScroll() {
  if (prefersReducedMotion() || !window.gsap) return;
  const tagline = document.querySelector('.hero-tagline');
  if (!tagline) return;
  const offset = Math.min(window.scrollY, 200);
  gsap.to(tagline, { y: offset * 0.2, opacity: 1 - offset / 200, overwrite: 'auto', duration: 0.3 });
}

function initHeroSlideshow() {
  if (prefersReducedMotion()) return;
  const slides = document.querySelectorAll('.hero-slideshow img');
  if (!slides.length) return;
  let current = 0;
  setInterval(() => {
    const next = (current + 1) % slides.length;
    slides[current].style.opacity = 0;
    slides[next].style.opacity = 1;
    current = next;
  }, 5000);
}

function initSectionObserver() {
  if (!('IntersectionObserver' in window)) return;
  const sections = document.querySelectorAll('section');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('section-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  sections.forEach(sec => {
    if (!sec.classList.contains('hero')) {
      sec.classList.add('section-hidden');
      observer.observe(sec);
    }
  });
}

function initPlanner() {
  const bar = document.getElementById('planner-progress');
  const tasks = document.querySelectorAll('#planner-tasks input[type="checkbox"]');
  if (!bar || !tasks.length) return;
  const update = () => {
    const completed = [...tasks].filter(t => t.checked).length;
    const percent = (completed / tasks.length) * 100;
    if (!prefersReducedMotion() && window.gsap) {
      gsap.to(bar, { width: percent + '%', duration: 0.5, ease: 'power2.out' });
    } else {
      bar.style.width = percent + '%';
    }
  };
  tasks.forEach(t => t.addEventListener('change', update));
  update();
}

function initAOS() {
  if (window.AOS) AOS.init();
}

function initImageFallback() {
  const images = document.querySelectorAll('img');
  images.forEach(img => {
    img.addEventListener('error', () => {
      if (!img.dataset.fallback) {
        img.dataset.fallback = 'true';
        img.src = 'assets/placeholder.svg';
      }
    });
  });
}

async function createProject(title) {
  const token = getHolidayToken();
  if (!token) {
    alert('Please save a token first.');
    return;
  }
  const headers = { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' };
  const ownerQuery = `
    query($login: String!) {
      user(login: $login) { id }
    }
  `;
  const ownerRes = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: ownerQuery, variables: { login: owner } })
  });
  const ownerData = await ownerRes.json();
  const ownerId = ownerData?.data?.user?.id;
  if (!ownerId) throw new Error('Unable to determine owner ID');
  const mutation = `
    mutation($input: CreateProjectV2Input!) {
      createProjectV2(input: $input) {
        projectV2 { id title }
      }
    }
  `;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: mutation,
      variables: { input: { ownerId, title } }
    })
  });
  const data = await res.json();
  if (data.errors) {
    throw new Error(data.errors.map(e => e.message).join(', '));
  }
  return data.data?.createProjectV2?.projectV2;
}

const saveBtn = document.getElementById('save-token');
if (saveBtn) {
  saveBtn.addEventListener('click', () => {
    const tokenInput = document.getElementById('token-input');
    const val = tokenInput.value.trim();
    if (val) {
      localStorage.setItem('HOLIDAY_TOKEN', val);
      tokenInput.value = '';
      loadData();
    }
  });
}


const projectForm = document.getElementById('new-project-form');
if (projectForm) {
  projectForm.addEventListener('submit', async e => {
    e.preventDefault();
    const title = document.getElementById('project-title').value.trim();
    const resultEl = document.getElementById('project-create-result');
    try {
      const project = await createProject(title);
      if (project) {
        if (resultEl) resultEl.textContent = `Project "${project.title}" created`;
        projectForm.reset();
        loadData();
      }
    } catch (err) {
      if (resultEl) resultEl.textContent = `Error: ${err.message}`;
    }
  });
}

const taskForm = document.getElementById('task-form');
if (taskForm) {
  taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = getHolidayToken();
    if (!token) {
      alert('Please save a token first.');
      return;
    }
    const title = document.getElementById('task-title').value;
    const body = document.getElementById('task-body').value;
    const projectId = document.getElementById('task-project').value;
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `token ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title, body })
    });
    const resultEl = document.getElementById('task-result');
    if (res.ok) {
      const data = await res.json();
      resultEl.innerHTML = `Task created: <a href="${data.html_url}" target="_blank">${data.number}</a>`;
      if (projectId) {
        try {
          const mutation = `
            mutation($projectId: ID!, $contentId: ID!) {
              addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
                item { id }
              }
            }
          `;
          await fetch('https://api.github.com/graphql', {
            method: 'POST',
            headers: {
              Authorization: `bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              query: mutation,
              variables: { projectId, contentId: data.node_id }
            })
          });
        } catch (err) {
          console.error('addProjectV2ItemById:', err);
        }
      }
      taskForm.reset();
      loadData();
    } else {
      const err = await res.json();
      resultEl.textContent = `Error: ${err.message}`;
    }
  });
}

const itineraryForm = document.getElementById('itinerary-form');
if (itineraryForm) {
  itineraryForm.addEventListener('submit', async e => {
    e.preventDefault();
    const token = getHolidayToken();
    if (!token) {
      alert('Please save a token first.');
      return;
    }
    const number = document.getElementById('itinerary-issue-number').value.trim();
    const day = parseInt(document.getElementById('itinerary-day').value, 10);
    const destination = document.getElementById('itinerary-destination').value;
    const activities = document.getElementById('itinerary-activities').value;
    const budget = document.getElementById('itinerary-budget').value;
    const photo = document.getElementById('itinerary-photo').value;
    const notes = document.getElementById('itinerary-notes').value;
    const bodyObj = { day, activities, budget, photo, notes };
    const coords = await geocodeDestination(destination);
    if (coords) {
      bodyObj.lat = coords.lat;
      bodyObj.lng = coords.lng;
    }
    const url = `https://api.github.com/repos/${owner}/${repo}/issues${number ? '/' + number : ''}`;
    const method = number ? 'PATCH' : 'POST';
    const payload = number
      ? { title: destination, body: JSON.stringify(bodyObj, null, 2) }
      : { title: destination, body: JSON.stringify(bodyObj, null, 2), labels: ['itinerary'] };
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `token ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const resultEl = document.getElementById('itinerary-result');
    if (res.ok) {
      const data = await res.json();
      resultEl.innerHTML = `Entry saved: <a href="${data.html_url}" target="_blank">#${data.number}</a>`;
      itineraryForm.reset();
      document.getElementById('itinerary-issue-number').value = '';
      loadData();
    } else {
      const err = await res.json();
      resultEl.textContent = `Error: ${err.message}`;
    }
  });
}

// Initial load
document.addEventListener('DOMContentLoaded', () => {
  loadProjectDetails('holiday-adventures');
  initItineraryMap();
  loadData();
  updateActiveNav();
  initAnimations();
  initHeroSlideshow();
  initSectionObserver();
  initPlanner();
  initAOS();
  initImageFallback();
});
window.addEventListener('scroll', () => {
  updateActiveNav();
  handleHeroScroll();
});
