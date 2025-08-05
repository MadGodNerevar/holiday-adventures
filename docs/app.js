const owner = window.location.hostname.split('.')[0];
const repoMeta = document.querySelector('meta[name="repo"]');
const repo = repoMeta ? repoMeta.getAttribute('content') : 'holiday-adventures';

function getHolidayToken() {
  return localStorage.getItem('HOLIDAY_TOKEN') || '';
}

async function loadTasks(headers) {
  const listEl = document.getElementById('tasks-list');
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
  boardEl.innerHTML = '';
  try {
    const projectRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/projects`, {
      headers: { ...headers, Accept: 'application/vnd.github.inertia-preview+json' }
    });
    if (!projectRes.ok) throw new Error('Failed to fetch projects');
    const projects = await projectRes.json();
    for (const project of projects) {
      const projectDiv = document.createElement('div');
      projectDiv.className = 'project';
      const projectTitle = document.createElement('h3');
      projectTitle.textContent = project.name;
      projectDiv.appendChild(projectTitle);

      const columnsRes = await fetch(project.columns_url, {
        headers: { ...headers, Accept: 'application/vnd.github.inertia-preview+json' }
      });
      if (!columnsRes.ok) continue;
      const columns = await columnsRes.json();
      const columnsContainer = document.createElement('div');
      columnsContainer.className = 'columns';
      for (const column of columns) {
        const columnDiv = document.createElement('div');
        columnDiv.className = 'column';
        const columnTitle = document.createElement('h4');
        columnTitle.textContent = column.name;
        columnDiv.appendChild(columnTitle);

        const cardsRes = await fetch(column.cards_url, {
          headers: { ...headers, Accept: 'application/vnd.github.inertia-preview+json' }
        });
        if (cardsRes.ok) {
          const cards = await cardsRes.json();
          const ul = document.createElement('ul');
          for (const card of cards) {
            const li = document.createElement('li');
            if (card.content_url) {
              const contentRes = await fetch(card.content_url, { headers });
              if (contentRes.ok) {
                const content = await contentRes.json();
                const link = document.createElement('a');
                link.href = content.html_url;
                link.textContent = content.title;
                link.target = '_blank';
                li.appendChild(link);
              } else {
                li.textContent = 'Item';
              }
            } else {
              li.textContent = card.note || 'Card';
            }
            ul.appendChild(li);
          }
          columnDiv.appendChild(ul);
        }
        columnsContainer.appendChild(columnDiv);
      }
      projectDiv.appendChild(columnsContainer);
      boardEl.appendChild(projectDiv);
    }
  } catch (err) {
    boardEl.textContent = 'Unable to load project board';
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
      if (!res.ok) continue;
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
      console.error(err);
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

document.getElementById('save-token').addEventListener('click', () => {
  const tokenInput = document.getElementById('token-input');
  const val = tokenInput.value.trim();
  if (val) {
    localStorage.setItem('HOLIDAY_TOKEN', val);
    tokenInput.value = '';
    loadData();
  }
});

document.getElementById('task-form').addEventListener('submit', async (e) => {
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
    document.getElementById('task-form').reset();
    loadData();
  } else {
    const err = await res.json();
    resultEl.textContent = `Error: ${err.message}`;
  }
});

// Initial load
loadData();
