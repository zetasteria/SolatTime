const form = document.querySelector("#location-form");
const locationInput = document.querySelector("#location");
const locationOptions = document.querySelector("#location-options");
const statusMessage = document.querySelector("#status-message");
const prayerTimesList = document.querySelector("#prayer-times");
const nextPrayerLabel = document.querySelector("#next-prayer-label");
const countdownDisplay = document.querySelector("#countdown");
const suggestionDisplay = document.querySelector("#activities");

let zonesByLocation = new Map();

const prayers = [
  { key: "fajr", name: "Subuh" },
  { key: "dhuhr", name: "Zohor" },
  { key: "asr", name: "Asar" },
  { key: "maghrib", name: "Maghrib" },
  { key: "isha", name: "Isyak" }
];


let todaySchedule = [];
let tomorrowFajr = null;
let countdownInterval = null;

// fetch the API.
async function loadLocations() {
  const response = await fetch("https://api.waktusolat.app/zones");

  if (!response.ok) {
    throw new Error("Could not load the location list.");
  }

  const zones = await response.json();

  for (const zone of zones) {
    const label = `${zone.daerah} — ${zone.negeri}`;

    zonesByLocation.set(label, zone.jakimCode);

    const option = document.createElement("option");
    option.value = label;
    locationOptions.appendChild(option);
  }
}

loadLocations().catch(error => {
  console.error(error);
  statusMessage.textContent = error.message;
});


// a Local Storage name for zone and month.
function getMonthKey(zone, date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `solat-api-${zone}-${date.getFullYear()}-${month}`;
}

// get prayer times from the API and save in Local Storage.
async function getMonthData(zone, date) {
  const key = getMonthKey(zone, date);
  const saved = localStorage.getItem(key);

  if (saved) {
    const cached = JSON.parse(saved);
    const oneDay = 24 * 60 * 60 * 1000;

    if (Date.now() - cached.savedAt < oneDay) {
      return cached.data;
    }
  }

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const url =`https://api.waktusolat.app/solat/${zone}?year=${year}&month=${month}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("The prayer-time service returned an error.");
  }

  const data = await response.json();

  if (!Array.isArray(data.prayerTime)) {
    throw new Error("The API response did not contain prayer times.");
  }

  localStorage.setItem(key, JSON.stringify({
    savedAt: Date.now(),
    data
  }));

  return data;
}

function getDayNumber(row) {
  if (row.date) {
    const dateText = String(row.date);

    // to handles dates yyyy/mm/dd
    const isoDate = dateText.match(/^\d{4}-\d{1,2}-(\d{1,2})/);
    if (isoDate) return Number(isoDate[1]);

    // hadle dates dd-mm-yyyy 
    const dayFirst = dateText.match(/^(\d{1,2})[-/ ]/);
    if (dayFirst) return Number(dayFirst[1]);
  }

  return Number(row.day);
}

function findRowForDate(monthData, date) {
  return monthData.prayerTime.find(
    row => getDayNumber(row) === date.getDate()
  );
}

function makePrayerDate(date, timeText) {
  const [hours, minutes, seconds = "0"] = timeText.split(":").map(Number);

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes,
    seconds
  );
}

// put the prayer times on home page.
function showPrayerTimes(row) {
  prayerTimesList.replaceChildren();

  for (const prayer of prayers) {
    const time = row[prayer.key];

    if (!time) continue;

    const item = document.createElement("li");
    item.textContent = `${prayer.name}: ${time}`;
    prayerTimesList.appendChild(item);
  }
}

// an activity suggestion for the next prayer.
function showSuggestion(prayerName) {
  let suggestion;

  if (prayerName === "Subuh") {
    suggestion = "Prepare for Subuh and take a quiet moment to reflect.";
  } else if (prayerName === "Zohor") {
    suggestion = "Prepare for Zohor and take a short break.If salah become your habits, success become your lifestyle";
  } else if (prayerName === "Asar") {
    suggestion = "Prepare for Asar and pause for a moment of reflection. وَٱللَّهُ خَيۡرُ ٱلۡمَٰكِرِينَ - And Allah is the best of planners";
  } else if (prayerName === "Maghrib") {
    suggestion = "Prepare for Maghrib and make time for prayer. وَمَا تَوْفِيقِىٓ إِلَّا بِٱللَّهِ ۚ - My success comes only through Allah";
  } else if (prayerName === "Isyak") {
    suggestion = "Prepare for Isyak and plan a calm end to your day. إِن يَنصُرْكُمُ ٱللَّهُ فَلَا غَالِبَ لَكُمْ ۖ- Allah helps you, none can defeat you";
  } else {
    suggestion = "No activity suggestion is available.";  //fallback suggestion
  }

  suggestionDisplay.textContent = suggestion;

  // suggestion activity
  localStorage.setItem("solatSuggestion", JSON.stringify({
    prayer: prayerName,
    text: suggestion,
    savedAt: new Date().toISOString()
  }));
}

// calculate how much time is left before the next prayer.
function updateCountdown() {
  const now = new Date();

  let nextPrayer = todaySchedule.find(
    prayer => prayer.time > now
  );

  if (nextPrayer) {
    nextPrayerLabel.textContent = `Next prayer: ${nextPrayer.name}`;
  } else {
    nextPrayer = tomorrowFajr;

    if (!nextPrayer) {
      countdownDisplay.textContent = "Next prayer time unavailable.";
      return;
    }

    nextPrayerLabel.textContent = "Next prayer: Subuh tomorrow";
  }

  const secondsLeft = Math.max(0,Math.ceil((nextPrayer.time - now) / 1000));

  const hours = Math.floor(secondsLeft / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  const seconds = secondsLeft % 60;

  countdownDisplay.textContent =`${hours}h ${minutes}m ${seconds}s`;

  showSuggestion(nextPrayer.name);
}

// load prayer times when the location form submitted.
// DOM
form.addEventListener("submit", async event => {
  event.preventDefault();

    const selectedLocation = locationInput.value.trim();
    const typedLocation = selectedLocation.toLowerCase();
    let zone = "";

    if (selectedLocation === "") {
      statusMessage.textContent = "Please enter your location.";
      return;
    }

    // look through the location names one by one.
    for (const location of zonesByLocation.keys()) {
      if (location.toLowerCase().includes(typedLocation)) {
        zone = zonesByLocation.get(location);
        break;
      }
    }

    if (!zone) {
    statusMessage.textContent = "Choose an area from the suggestions under the location box.";
    return;
    }

  statusMessage.textContent = "Loading prayer times...";
  prayerTimesList.replaceChildren();
  clearInterval(countdownInterval);

  try {
    const today = new Date();
    const todayData = await getMonthData(zone, today);
    const todayRow = findRowForDate(todayData, today);

    if (!todayRow) {
      throw new Error("No prayer times were found for today.");
    }

    todaySchedule = prayers
      .filter(prayer => todayRow[prayer.key])
      .map(prayer => ({
        name: prayer.name,
        time: makePrayerDate(today, todayRow[prayer.key])
      }));

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    let tomorrowData = todayData;

    if (tomorrow.getMonth() !== today.getMonth()) {
      tomorrowData = await getMonthData(zone, tomorrow);
    }

    const tomorrowRow = findRowForDate(tomorrowData, tomorrow);

    tomorrowFajr = tomorrowRow?.fajr
      ? {
          name: "Subuh",
          time: makePrayerDate(tomorrow, tomorrowRow.fajr)
        }
      : null;

    showPrayerTimes(todayRow);
    statusMessage.textContent = `Showing today's times for ${selectedLocation}.`;

    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
  } catch (error) {
    statusMessage.textContent = `Could not load prayer times: ${error.message}`;
    countdownDisplay.textContent = "--";
  }
});

const prayerPage = document.querySelector("#prayer-page");
const remindersPage = document.querySelector("#reminders-page");

const showPrayerButton = document.querySelector("#show-prayer-page");
const showRemindersButton = document.querySelector("#show-reminders-page");

showPrayerButton.addEventListener("click", () => {
  prayerPage.hidden = false;
  remindersPage.hidden = true;
});

showRemindersButton.addEventListener("click", () => {
  prayerPage.hidden = true;
  remindersPage.hidden = false;
});

// class for adds, displays, edits, and deletes reminders.
class ReminderApp {
  constructor() {
    this.form = document.querySelector("#reminder-form");
    this.title = document.querySelector("#reminder-title");
    this.date = document.querySelector("#reminder-date");
    this.time = document.querySelector("#reminder-time");
    this.note = document.querySelector("#reminder-note");
    this.message = document.querySelector("#reminder-message");
    this.list = document.querySelector("#reminder-list");
    this.button = this.form.querySelector("button[type='submit']");
    this.editingId = null;

    try {
      this.reminders = JSON.parse(
        localStorage.getItem("solatReminders") || "[]"
      );
    } catch {
      this.reminders = [];
    }
    this.reminders.forEach((reminder, index) => {
    if (!reminder.id) {
    reminder.id = `${Date.now()}-${index}`;
  }
});

localStorage.setItem("solatReminders", JSON.stringify(this.reminders));

    this.form.addEventListener("submit", event => this.save(event));
    this.list.addEventListener("click", event => this.handleClick(event));

    this.show();
  }

  // Add a reminder or save update reminder.
  save(event) {
    event.preventDefault();

    const details = {
      title: this.title.value.trim(),
      date: this.date.value,
      time: this.time.value,
      note: this.note.value.trim()
    };

    if (!details.title || !details.date || !details.time) {
      this.message.textContent = "Enter a title, date, and time.";
      return;
    }

    if (this.editingId) {
      const reminder = this.reminders.find(item => item.id === this.editingId);
      Object.assign(reminder, details);
      this.message.textContent = "Reminder updated.";
    } else {
      this.reminders.push({ id: Date.now().toString(), ...details });
      this.message.textContent = "Reminder saved.";
    }

    localStorage.setItem("solatReminders", JSON.stringify(this.reminders));
    this.form.reset();
    this.editingId = null;
    this.button.textContent = "Add reminder";
    this.show();
  }

  // Check whether the user clicked Edit or Delete.
  handleClick(event) {
    const button = event.target.closest("button");
    if (!button) return;

    const reminder = this.reminders.find(item => item.id === button.dataset.id);
    if (!reminder) return;

    if (button.dataset.action === "edit") {
      this.editingId = reminder.id;
      this.title.value = reminder.title;
      this.date.value = reminder.date;
      this.time.value = reminder.time;
      this.note.value = reminder.note;
      this.button.textContent = "Update";
    }
    else {
      this.reminders = this.reminders.filter(item => item.id !== reminder.id);
      localStorage.setItem("solatReminders", JSON.stringify(this.reminders));
      this.message.textContent = "Reminder deleted.";
      this.show();
    }
  }
  // Display all saved reminders on the page.
  show() {
    this.list.replaceChildren();

    for (const reminder of this.reminders) {
      const item = document.createElement("li");
      const text = document.createElement("span");
      text.textContent =
    reminder.title + " — " + reminder.date + " at " + reminder.time;

    if (reminder.note !== "") {
      text.textContent = text.textContent + " — Note: " + reminder.note;
  }

      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "Edit";
      edit.dataset.action = "edit";
      edit.dataset.id = reminder.id;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Delete";
      remove.dataset.action = "delete";
      remove.dataset.id = reminder.id;

      item.append(text, edit, remove);
      this.list.appendChild(item);
    }
  }
}
new ReminderApp();

const prayerCheckboxes = document.querySelectorAll(".prayer-check");
const prayerTotal = document.querySelector("#prayer-total");

//calculation 2
// count how many prayer boxes are ticked.
function countPrayers() {
  let total = 0;

  for (const checkbox of prayerCheckboxes) {
    if (checkbox.checked) {
      total = total + 1;
    }
  }

  prayerTotal.textContent = total;
}

for (const checkbox of prayerCheckboxes) {
  checkbox.addEventListener("change", countPrayers);
}
