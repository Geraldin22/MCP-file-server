const KEY = "todo-tasks";
let tasks = JSON.parse(localStorage.getItem(KEY) || "[]");

function save() {
  localStorage.setItem(KEY, JSON.stringify(tasks));
}

function addTask(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return;
  tasks.push({ id: Date.now(), text: trimmed, done: false });
  save();
  render();
}

function toggleTask(id) {
  const task = tasks.find(function (t) { return t.id === id; });
  task.done = !task.done;
  save();
  render();
}

function deleteTask(id) {
  tasks = tasks.filter(function (t) { return t.id !== id; });
  save();
  render();
}

function render() {
  const list = document.getElementById("list");
  list.innerHTML = "";
  tasks.forEach(function (t) {
    const li = document.createElement("li");
    if (t.done) li.className = "done";

    const span = document.createElement("span");
    span.className = "text";
    span.textContent = t.text;
    span.onclick = function () { toggleTask(t.id); };

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "delete";
    btn.textContent = "Delete";
    btn.onclick = function (e) {
      e.stopPropagation();
      deleteTask(t.id);
    };

    li.appendChild(span);
    li.appendChild(btn);
    list.appendChild(li);
  });
  document.getElementById("count").textContent = tasks.filter(function (t) { return !t.done; }).length + " tasks left";
}

document.getElementById("form").onsubmit = function (e) {
  e.preventDefault();
  const input = document.getElementById("input");
  addTask(input.value);
  input.value = "";
};

render();
