// Configuration for repository information
// Allow overrides via query parameters (e.g., ?owner=user&repo=project),
// a global config object `window.HOLIDAY_CONFIG`, or environment variables
// exposed on `window.ENV`. Falls back to parsing the current URL.
const queryParams = new URLSearchParams(window.location.search);
const globalConfig = window.HOLIDAY_CONFIG || {};
const envConfig = (typeof window !== 'undefined' && (window.ENV || window.env)) || {};

const ownerMeta = document.querySelector('meta[name="owner"]');
const owner =
  queryParams.get('owner') ||
  globalConfig.owner ||
  envConfig.GITHUB_OWNER ||
  (ownerMeta ? ownerMeta.getAttribute('content') : null) ||
  window.location.hostname.split('.')[0];

const repoMeta = document.querySelector('meta[name="repo"]');
const repo =
  queryParams.get('repo') ||
  globalConfig.repo ||
  envConfig.GITHUB_REPO ||
  (repoMeta ? repoMeta.getAttribute('content') : null) ||
  window.location.pathname.split('/')[1] ||
  'holiday-adventures';

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
  return localStorage.getItem('HOLIDAY_TOKEN') || '';
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
  } catch (err) {
    boardEl.textContent = 'Projects could not be loaded.';
    console.error(err);
  }
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

// Initial load
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  updateActiveNav();
});
window.addEventListener('scroll', updateActiveNav);
