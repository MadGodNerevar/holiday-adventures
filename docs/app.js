// Configuration for repository information
// Allow overrides via query parameters (e.g., ?owner=user&repo=project),
// a global config object `window.HOLIDAY_CONFIG`, or environment variables
// exposed on `window.ENV`. Falls back to parsing the current URL.
import { GITHUB_TOKEN } from './config.js';
const queryParams = new URLSearchParams(window.location.search);
const globalConfig = window.HOLIDAY_CONFIG || {};
const envConfig = (typeof window !== 'undefined' && (window.ENV || window.env)) || {};

const username = 'MadGodNerevar';
const owner = username;

const repoMeta = document.querySelector('meta[name="repo"]');
let repo =
  queryParams.get('repo') ||
  globalConfig.repo ||
  envConfig.GITHUB_REPO ||
  (repoMeta ? repoMeta.getAttribute('content') : null) ||
  'next-trip';

// Access key for Unsplash API (required for destination images)
const unsplashAccessKey =
  queryParams.get('unsplashKey') ||
  globalConfig.unsplashAccessKey ||
  envConfig.UNSPLASH_ACCESS_KEY ||
  '';

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function initTheme() {
  const root = document.documentElement;
  const selector = document.getElementById('theme-selector');
  const storedTheme = localStorage.getItem('theme');
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const currentTheme = storedTheme || (media.matches ? 'dark' : 'light');
  root.setAttribute('data-theme', currentTheme);
  if (selector) selector.value = currentTheme;

  media.addEventListener('change', e => {
    if (!localStorage.getItem('theme')) {
      const newTheme = e.matches ? 'dark' : 'light';
      root.setAttribute('data-theme', newTheme);
      if (selector) selector.value = newTheme;
    }
  });

  if (selector) {
    selector.addEventListener('change', e => {
      const theme = e.target.value;
      root.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
    });
  }
}

document.addEventListener('DOMContentLoaded', initTheme);

function getHolidayToken() {
  return GITHUB_TOKEN || localStorage.getItem('HOLIDAY_TOKEN') || '';
}

async function loadUserProjects() {
  const selector = document.getElementById('project-selector');
  if (!selector) return;
  try {
    const res = await fetch(`https://api.github.com/users/${owner}/repos`);
    if (!res.ok) throw new Error('Failed to load repositories');
    const projects = await res.json();
    selector.innerHTML = '';
    projects.forEach(p => {
      const option = document.createElement('option');
      option.value = p.name;
      option.textContent = p.name.replace(/-/g, ' ');
      selector.appendChild(option);
    });
    selector.value = repo;
  } catch (err) {
    console.error('loadUserProjects:', err);
  }
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

async function loadTasks(headers) {
  try {
    const listEl = document.getElementById('tasks-list');
    if (!listEl) {
      console.warn('Tasks list element not found');
      return;
    }
    listEl.innerHTML = '';
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

async function loadProjectBoard(headers) {
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
    const projects = projectData?.data?.repository?.projectsV2?.nodes || [];
    if (!projects.length) {
      boardEl.textContent = 'No projects found';
      return;
    }
    for (const project of projects) {
      const projectDiv = document.createElement('div');
      projectDiv.className = 'project';
      projectDiv.dataset.title = project.title;
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
  } catch (err) {
    boardEl.textContent = 'Projects could not be loaded.';
    console.error(err);
  }
}

function populateProjectSelector(projects) {
  const select = document.getElementById('project-select');
  if (!select) return;
  select.innerHTML = '<option value="">All Projects</option>';
  projects.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.title;
    opt.textContent = p.title;
    select.appendChild(opt);
  });
  select.addEventListener('change', e => {
    const value = e.target.value;
    document.querySelectorAll('#project-board .project').forEach(div => {
      div.style.display = !value || div.dataset.title === value ? '' : 'none';
    });
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
          const a = document.createElement('a');
          a.href = file.html_url;
          a.textContent = file.name;
          a.target = '_blank';
          li.appendChild(a);
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

async function loadItinerary(headers) {
  const timelineEl = document.getElementById('itinerary-timeline');
  if (!timelineEl) return;
  timelineEl.innerHTML = '';
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues?labels=itinerary&per_page=100`,
      { headers }
    );
    if (!res.ok) {
      timelineEl.textContent = 'No itinerary entries found.';
      return;
    }
    const items = await res.json();
    items.forEach(issue => {
      const wrapper = document.createElement('div');
      wrapper.className = 'itinerary-item';
      let data = {};
      try {
        data = issue.body ? JSON.parse(issue.body) : {};
      } catch (_) {
        data = {};
      }
      const title = document.createElement('h3');
      title.textContent = issue.title;
      wrapper.appendChild(title);
      if (data.photo) {
        const img = document.createElement('img');
        img.src = data.photo;
        img.alt = issue.title;
        img.loading = 'lazy';
        wrapper.appendChild(img);
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
          wrapper.appendChild(p);
        }
      });
      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => {
        const form = document.getElementById('itinerary-form');
        if (!form) return;
        document.getElementById('itinerary-issue-number').value = issue.number;
        document.getElementById('itinerary-destination').value = issue.title;
        document.getElementById('itinerary-activities').value = data.activities || '';
        document.getElementById('itinerary-budget').value = data.budget || '';
        document.getElementById('itinerary-photo').value = data.photo || '';
        document.getElementById('itinerary-notes').value = data.notes || '';
        form.scrollIntoView({ behavior: 'smooth' });
      });
      wrapper.appendChild(editBtn);
      timelineEl.appendChild(wrapper);
    });
  } catch (err) {
    timelineEl.textContent = 'Unable to load itinerary.';
    console.error('loadItinerary:', err && err.message ? err.message : err);
  }
}

  function loadData() {
    if (!owner) {
      console.warn('GitHub owner could not be determined. Please configure it.');
      let warnEl = document.getElementById('config-warning');
      if (!warnEl) {
        warnEl = document.createElement('div');
        warnEl.id = 'config-warning';
        warnEl.textContent = 'GitHub owner is not configured. Please set it via ?owner= or a meta tag.';
        const container = document.querySelector('.container') || document.body;
        container.insertBefore(warnEl, container.firstChild);
      }
      return;
    }
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

function startHeroSlideshow() {
  const slides = document.querySelectorAll('.hero-slideshow img');
  if (!slides.length) return;
  let index = 0;
  slides[index].classList.add('active');
  if (prefersReducedMotion() || slides.length === 1) return;
  setInterval(() => {
    slides[index].classList.remove('active');
    index = (index + 1) % slides.length;
    slides[index].classList.add('active');
  }, 5000);
}

function initAnimations() {
  if (!prefersReducedMotion() && window.gsap) {
    gsap.from('.main-nav a', { y: -20, opacity: 0, duration: 0.6, stagger: 0.1, ease: 'power2.out' });
    gsap.from('.hero-tagline', { y: 50, opacity: 0, duration: 1, ease: 'power2.out' });
    gsap.from('.hero-cta button', { y: 20, opacity: 0, duration: 0.6, stagger: 0.1, ease: 'power2.out' });
  }
  startHeroSlideshow();
}

function handleHeroScroll() {
  if (prefersReducedMotion() || !window.gsap) return;
  const tagline = document.querySelector('.hero-tagline');
  if (!tagline) return;
  const offset = Math.min(window.scrollY, 200);
  gsap.to(tagline, { y: offset * 0.2, opacity: 1 - offset / 200, overwrite: 'auto', duration: 0.3 });
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

const projectSelector = document.getElementById('project-selector');
if (projectSelector) {
  projectSelector.addEventListener('change', e => {
    repo = e.target.value || 'next-trip';
    loadProjectDetails(repo);
    loadData();
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
    const destination = document.getElementById('itinerary-destination').value;
    const activities = document.getElementById('itinerary-activities').value;
    const budget = document.getElementById('itinerary-budget').value;
    const photo = document.getElementById('itinerary-photo').value;
    const notes = document.getElementById('itinerary-notes').value;
    const bodyObj = { activities, budget, photo, notes };
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
  loadUserProjects().then(() => loadProjectDetails(repo));
  loadData();
  updateActiveNav();
  initAnimations();
  initSectionObserver();
  initPlanner();
  initAOS();
});
window.addEventListener('scroll', () => {
  updateActiveNav();
  handleHeroScroll();
});
