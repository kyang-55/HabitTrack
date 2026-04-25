# HabitTrack
HabitTrack is a web-based habit tracker built with Node.js, Express, and SQLite. Users can create, edit, and delete habits, log daily completions, view streaks, and track progress visually. The app supports reminders for off-days and provides a responsive, interactive interface.

## Features

- Add, edit, and delete habits
- Log daily habit completions
- Prevent duplicate logging for the same day
- Highlight completed habits visually
- Show success/error feedback messages
- Responsive habit cards with hover effects
- Simple streak and habit organization
- Off-day scheduling support
- Fully interactive UI

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express
- **Database:** SQLite
- **Tools:** VSCode (for testing APIs)

## Bash Command Package

`npm install express cors sqlite3`

## Installation

1. Clone the repository:

```bash
git clone 
```

2. Install dependencies, initialize the database, and start the app:

```bash
npm install
npm run db:init
npm start
```

The `npm run db:init` command creates the SQLite database file and initializes the required tables. The app also performs this initialization automatically on startup.

## Database Notes

This project uses SQLite as its application database, so a database initialization script is included via `npm run db:init`. Firebase is used only for authentication and external account management, so it does not require a local database creation script in the same way.