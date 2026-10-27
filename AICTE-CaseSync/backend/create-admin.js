const bcrypt = require('bcryptjs');
const pool = require('./db');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function createAdmin() {
  try {
    const fullName = await new Promise(resolve =>
      rl.question('Enter admin name: ', resolve)
    );

    const email = await new Promise(resolve =>
      rl.question('Enter admin email: ', resolve)
    );

    const password = await new Promise(resolve =>
      rl.question('Create admin password: ', resolve)
    );

    if (!fullName.trim() || !email.trim() || password.length < 8) {
      console.log('Name and email are required; password must be at least 8 characters.');
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES (?, ?, ?, 'Admin')`,
      [fullName.trim(), email.trim().toLowerCase(), passwordHash]
    );

    console.log('Admin account created successfully!');
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      console.log('An account with this email already exists.');
    } else {
      console.error('Could not create admin:', error.message);
    }
  } finally {
    rl.close();
    await pool.end();
  }
}

createAdmin();