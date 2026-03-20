import fs from 'fs';
import path from 'path';

export const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

export const saveJSON = (filePath, data) => {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
};

export const loadJSON = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
};

export const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const readFileText = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf8');
};
