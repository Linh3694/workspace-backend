const { exec } = require('child_process');

function connectToNLV(query, callback) {
  const searchQuery = query || 'Nguyen Tuan'; // Xử lý logic trong JS
  const commands = `open z3950.nlv.gov.vn:9999/biblios\nfind @attr 1=1 "${searchQuery}"\nshow 1+10\nquit`;
  
  const command = `echo -e "${commands}" | yaz-client -v`;
  console.log("[DEBUG] Command:\n", command);

  exec(command, { encoding: 'utf8' }, (err, stdout, stderr) => {
    if (err) {
      console.error("[ERROR] Execution failed:", err.message);
      return callback(err, null);
    }

    console.log("[STDOUT]", stdout || "No output returned");
    if (stderr) {
      console.warn("[STDERR]", stderr);
    }

    if (!stdout || stdout.trim() === '') {
      return callback(new Error('No data returned from server'), null);
    }

    return callback(null, { stdout, stderr });
  });
}

// Chạy thử
connectToNLV('Nguyen Tuan', (err, result) => {
  if (err) {
    console.error('Error:', err.message);
  } else {
    console.log('Result:', result.stdout);
    console.log('Log:', result.stderr);
  }
});

module.exports = { connectToNLV };