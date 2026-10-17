const KEY = "todo-tasks";
let tasks = JSON.parse(localStorage.getItem(KEY) || "[]");

function save() {
  localStorage.setItem(KEY, JSON.stringify(tasks));
}

function addTask(text) {
  tasks.push({ id: Date.now(), text: text, done: false });
  save();
  render();
}

function toggleTask(id) {
  const task = tasks.find(function (t) { return t.id === id; });
  task.done = true;
  save();
  render();
}

function render() {
  const list = document.getElementById("list");
  list.innerHTML = "";
  tasks.forEach(function (t) {
    const li = document.createElement("li");
    li.textContent = t.text;
    if (t.done) li.className = "done";
    li.onclick = function () { toggleTask(t.id); };
    list.appendChild(li);
  });
  document.getElementById("count").textContent = tasks.length + " tasks left";
}

document.getElementById("form").onsubmit = function (e) {
  e.preventDefault();
  const input = document.getElementById("input");
  addTask(input.value);
  input.value = "";
};

render();
