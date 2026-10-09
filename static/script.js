const taskList = document.getElementById("task-list");
const taskModal = document.getElementById("task-modal");
const taskForm = document.getElementById("task-form");
const modalTitle = document.getElementById("modal-title");
const saveButton = document.getElementById("save-task");
const formError = document.getElementById("form-error");
const searchInput = document.getElementById("search-input");
const filterSelect = document.getElementById("filter-select");
const sortSelect = document.getElementById("sort-select");

let tasks = [];
let editingId = null;
let toastTimer;

const $ = (id) => document.getElementById(id);

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("Please log in again.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Something went wrong.");
  }
  return data;
}

function openModal(task = null) {
  editingId = task ? task.id : null;
  taskForm.reset();
  formError.textContent = "";

  modalTitle.textContent = task ? "Edit your task." : "Create a task.";
  saveButton.textContent = task ? "Save changes ↗" : "Create task ↗";

  if (task) {
    $("task-title").value = task.title;
    $("task-description").value = task.description || "";
    $("task-priority").value = task.priority || "Medium";
    $("task-due").value = task.due_date || "";
  }

  taskModal.classList.add("open");
  taskModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  setTimeout(() => $("task-title").focus(), 100);
}

function closeModal() {
  taskModal.classList.remove("open");
  taskModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  editingId = null;
  formError.textContent = "";
}

$("open-add").addEventListener("click", () => openModal());
$("close-modal").addEventListener("click", closeModal);
$("cancel-modal").addEventListener("click", closeModal);

taskModal.addEventListener("click", (event) => {
  if (event.target === taskModal) closeModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  formError.textContent = "";

  const data = {
    title: $("task-title").value.trim(),
    description: $("task-description").value.trim(),
    priority: $("task-priority").value,
    due_date: $("task-due").value
  };

  if (!data.title) {
    formError.textContent = "Please enter a task name.";
    return;
  }

  saveButton.disabled = true;
  saveButton.textContent = "Saving...";

  try {
    if (editingId !== null) {
      await api(`/api/tasks/${editingId}`, {
        method: "PUT",
        body: JSON.stringify(data)
      });
      showToast("Changes saved successfully ✨");
    } else {
      await api("/api/tasks", {
        method: "POST",
        body: JSON.stringify(data)
      });
      showToast("New task added. Let's go! ✦");
    }

    closeModal();
    await loadTasks();
  } catch (error) {
    formError.textContent = error.message;
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = editingId !== null
      ? "Save changes ↗"
      : "Create task ↗";
  }
});

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createTaskCard(task, index) {
  const card = createElement(
    "article",
    "task-card" + (task.completed ? " is-completed" : "")
  );
  card.style.animationDelay = `${Math.min(index * 35, 210)}ms`;

  const checkbox = createElement("input", "task-check");
  checkbox.type = "checkbox";
  checkbox.checked = Boolean(task.completed);
  checkbox.setAttribute("aria-label", `Complete ${task.title}`);

  checkbox.addEventListener("change", async () => {
    checkbox.disabled = true;
    try {
      await api(`/api/tasks/${task.id}`, {
        method: "PUT",
        body: JSON.stringify({ completed: checkbox.checked })
      });
      showToast(checkbox.checked ? "Task completed! 🎉" : "Task reopened");
      await loadTasks();
    } catch (error) {
      showToast(error.message);
      checkbox.checked = !checkbox.checked;
      checkbox.disabled = false;
    }
  });

  const main = createElement("div", "task-main");
  const title = createElement("div", "task-title", task.title);
  main.appendChild(title);

  if (task.description) {
    main.appendChild(createElement("p", "task-description", task.description));
  }

  const meta = createElement("div", "task-meta");
  const priorityClass = {
    Low: "priority-low",
    Medium: "priority-medium",
    High: "priority-high"
  }[task.priority] || "priority-medium";

  meta.appendChild(createElement(
    "span", `priority ${priorityClass}`, `${task.priority} priority`
  ));

  if (task.due_date) {
    const due = createElement("span", "due-badge");
    const date = new Date(`${task.due_date}T00:00:00`);
    due.textContent = `Due ${date.toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric"
    })}`;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!task.completed && date < today) due.classList.add("overdue");
    meta.appendChild(due);
  }

  main.appendChild(meta);

  const actions = createElement("div", "task-actions");
  const editButton = createElement("button", "icon-btn", "✎");
  editButton.type = "button";
  editButton.title = "Edit task";
  editButton.setAttribute("aria-label", `Edit ${task.title}`);
  editButton.addEventListener("click", () => openModal(task));

  const deleteButton = createElement("button", "icon-btn delete-btn", "×");
  deleteButton.type = "button";
  deleteButton.title = "Delete task";
  deleteButton.setAttribute("aria-label", `Delete ${task.title}`);
  deleteButton.addEventListener("click", async () => {
    if (!window.confirm(`Delete "${task.title}"?`)) return;

    deleteButton.disabled = true;
    try {
      await api(`/api/tasks/${task.id}`, { method: "DELETE" });
      showToast("Task deleted");
      await loadTasks();
    } catch (error) {
      showToast(error.message);
      deleteButton.disabled = false;
    }
  });

  actions.append(editButton, deleteButton);
  card.append(checkbox, main, actions);
  return card;
}

function renderTasks() {
  const query = searchInput.value.trim().toLowerCase();
  const filter = filterSelect.value;
  const sort = sortSelect.value;

  let visibleTasks = tasks.filter((task) => {
    const matchesSearch =
      task.title.toLowerCase().includes(query) ||
      (task.description || "").toLowerCase().includes(query);

    const matchesFilter =
      filter === "all" ||
      (filter === "completed" && Boolean(task.completed)) ||
      (filter === "pending" && !task.completed);

    return matchesSearch && matchesFilter;
  });

  if (sort === "priority") {
    const rank = { High: 0, Medium: 1, Low: 2 };
    visibleTasks.sort((a, b) => rank[a.priority] - rank[b.priority]);
  } else if (sort === "due") {
    visibleTasks.sort((a, b) => {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });
  } else {
    visibleTasks.sort((a, b) => b.id - a.id);
  }

  taskList.replaceChildren();

  if (visibleTasks.length === 0) {
    const empty = createElement("div", "empty-state");
    empty.appendChild(createElement("div", "empty-icon", query ? "⌕" : "✦"));
    empty.appendChild(createElement(
      "h3", "", query ? "No matches found" :
        filter === "completed" ? "No completed tasks yet" :
        filter === "pending" ? "All caught up?" : "A fresh start."
    ));
    empty.appendChild(createElement(
      "p", "", query
        ? "Try another search term."
        : filter === "all"
          ? "Add your first task and turn your plans into progress."
          : "Your tasks will show up here."
    ));

    if (filter === "all" && !query) {
      const addButton = createElement("button", "primary-btn", "＋ Create your first task");
      addButton.type = "button";
      addButton.addEventListener("click", () => openModal());
      empty.appendChild(addButton);
    }
    taskList.appendChild(empty);
  } else {
    visibleTasks.forEach((task, index) => {
      taskList.appendChild(createTaskCard(task, index));
    });
  }

  $("list-footer").textContent =
    `${visibleTasks.length} of ${tasks.length} task${tasks.length === 1 ? "" : "s"} shown`;
}

function updateStats() {
  const total = tasks.length;
  const completed = tasks.filter((task) => Boolean(task.completed)).length;
  const pending = total - completed;
  const percent = total ? Math.round(completed / total * 100) : 0;

  $("total-count").textContent = total;
  $("pending-count").textContent = pending;
  $("completed-count").textContent = completed;
  $("progress-percent").textContent = `${percent}%`;
  $("progress-fill").style.width = `${percent}%`;

  $("progress-caption").textContent = total === 0
    ? "Every completed task is a win. Let's start!"
    : percent === 100
      ? "Amazing! You've completed every task. 🎉"
      : `${completed} completed, ${pending} to go. Keep your momentum!`;
}

async function loadTasks() {
  try {
    tasks = await api("/api/tasks");
    updateStats();
    renderTasks();
  } catch (error) {
    taskList.replaceChildren(
      createElement("div", "empty-state", error.message)
    );
  }
}

searchInput.addEventListener("input", renderTasks);
filterSelect.addEventListener("change", renderTasks);
sortSelect.addEventListener("change", renderTasks);

const now = new Date();
$("current-date").textContent = now.toLocaleDateString("en-IN", {
  day: "numeric", month: "short", year: "numeric"
});
$("today-label").textContent = now.toLocaleDateString("en-IN", {
  weekday: "long"
}).toUpperCase();

loadTasks();