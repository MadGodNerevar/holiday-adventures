// Configuration for repository information
// Allow overrides via query parameters (e.g., ?owner=user&repo=project),
// a global config object `window.HOLIDAY_CONFIG`, or environment variables
// exposed on `window.ENV`. Falls back to parsing the current URL.
const queryParams = new URLSearchParams(window.location.search);
const globalConfig = window.HOLIDAY_CONFIG || {};
const envConfig = (typeof window !== 'undefined' && (window.ENV || window.env)) || {};

const owner =
  queryParams.get('owner') ||
  globalConfig.owner ||
  envConfig.GITHUB_OWNER ||
  window.location.hostname.split('.')[0];

const repoMeta = document.querySelector('meta[name="repo"]');
const repo =
  queryParams.get('repo') ||
  globalConfig.repo ||
  envConfig.GITHUB_REPO ||
  (repoMeta ? repoMeta.getAttribute('content') : null) ||
  window.location.pathname.split('/')[1] ||
  'holiday-adventures';


function getHolidayToken() {
  return localStorage.getItem('HOLIDAY_TOKEN') || '';
}

async function loadTasks(headers) {
  const listEl = document.getElementById('tasks-list');
  if (!listEl) {
    console.warn('Tasks list element not found');
    return;
  }
  listEl.innerHTML = '';
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, { headers });
    if (!res.ok) throw new Error('Failed to fetch tasks');
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
    const li = document.createElement('li');
    li.textContent = 'Unable to load tasks';
    listEl.appendChild(li);
    console.error(err);
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
    { path: 'itinerary-templates', title: 'Itinerary Templates' }
  ];
  for (const { path, title } of sections) {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, { headers });
      if (res.status === 404) {
        const msg = document.createElement('p');
        msg.textContent = `No data available for ${title}`;
        container.appendChild(msg);
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
      console.warn(`Failed to load ${path}: ${err.message}`);
    }
  }
}

function loadData() {
  const token = getHolidayToken();
  const headers = token ? { Authorization: `token ${token}` } : {};
  loadTasks(headers);
  loadProjectBoard(headers);
  loadHolidayBits(headers);
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
document.addEventListener('DOMContentLoaded', loadData);
