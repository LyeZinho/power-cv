import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'data', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const getLogFile = () => {
  const date = new Date().toISOString().split('T')[0];
  return path.join(logsDir, `${date}.log`);
};

const formatLog = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  let logEntry = `[${timestamp}] ${level}: ${message}`;
  if (data) {
    logEntry += ` ${JSON.stringify(data)}`;
  }
  return logEntry;
};

const writeLog = (level, message, data = null) => {
  const logEntry = formatLog(level, message, data);
  const logFile = getLogFile();
  
  console.log(logEntry);
  
  try {
    fs.appendFileSync(logFile, logEntry + '\n', 'utf8');
  } catch (error) {
    console.error(`Failed to write to log file: ${error.message}`);
  }
};

const logger = {
  info: (message, data = null) => writeLog('INFO', message, data),
  error: (message, data = null) => writeLog('ERROR', message, data),
  warn: (message, data = null) => writeLog('WARN', message, data),
  debug: (message, data = null) => writeLog('DEBUG', message, data),
};

export default logger;
