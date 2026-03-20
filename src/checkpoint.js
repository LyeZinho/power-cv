import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { saveJSON, loadJSON, ensureDir } from './utils.js';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CHECKPOINT_DIR = path.join(__dirname, '..', '.checkpoint');
const PHASES = ['phase_1', 'phase_2', 'phase_3'];

export const initCheckpoints = () => {
  try {
    ensureDir(CHECKPOINT_DIR);
    logger.info('Checkpoints initialized', { dir: CHECKPOINT_DIR });
    return true;
  } catch (error) {
    logger.error('Failed to initialize checkpoints', { error: error.message });
    return false;
  }
};

export const saveCheckpoint = (phase, data) => {
  try {
    if (!PHASES.includes(phase)) {
      throw new Error(`Invalid phase: ${phase}. Must be one of ${PHASES.join(', ')}`);
    }

    const checkpoint = {
      phase,
      timestamp: new Date().toISOString(),
      data,
    };

    const checkpointPath = path.join(CHECKPOINT_DIR, `${phase}.json`);
    saveJSON(checkpointPath, checkpoint);

    logger.info(`Checkpoint saved for ${phase}`);
    return true;
  } catch (error) {
    logger.error(`Failed to save checkpoint for ${phase}`, { error: error.message });
    return false;
  }
};

export const loadCheckpoint = (phase) => {
  try {
    if (!PHASES.includes(phase)) {
      throw new Error(`Invalid phase: ${phase}. Must be one of ${PHASES.join(', ')}`);
    }

    const checkpointPath = path.join(CHECKPOINT_DIR, `${phase}.json`);
    const checkpoint = loadJSON(checkpointPath);

    if (checkpoint) {
      logger.info(`Checkpoint loaded for ${phase}`);
      return checkpoint;
    }

    logger.info(`No checkpoint found for ${phase}`);
    return null;
  } catch (error) {
    logger.error(`Failed to load checkpoint for ${phase}`, { error: error.message });
    return null;
  }
};

export const getLatestCheckpoint = () => {
  try {
    for (let i = PHASES.length - 1; i >= 0; i--) {
      const phase = PHASES[i];
      const checkpointPath = path.join(CHECKPOINT_DIR, `${phase}.json`);
      const checkpoint = loadJSON(checkpointPath);

      if (checkpoint) {
        logger.info(`Latest checkpoint found: ${phase}`);
        return checkpoint;
      }
    }

    logger.info('No checkpoints found');
    return null;
  } catch (error) {
    logger.error('Failed to get latest checkpoint', { error: error.message });
    return null;
  }
};

export const clearCheckpoint = (phase) => {
  try {
    if (!PHASES.includes(phase)) {
      throw new Error(`Invalid phase: ${phase}. Must be one of ${PHASES.join(', ')}`);
    }

    const checkpointPath = path.join(CHECKPOINT_DIR, `${phase}.json`);
    const checkpoint = loadJSON(checkpointPath);

    if (!checkpoint) {
      logger.info(`Checkpoint for ${phase} does not exist`);
      return true;
    }

    fs.unlinkSync(checkpointPath);
    logger.info(`Checkpoint cleared for ${phase}`);
    return true;
  } catch (error) {
    logger.error(`Failed to clear checkpoint for ${phase}`, { error: error.message });
    return false;
  }
};

export const clearAllCheckpoints = () => {
  try {
    let clearedCount = 0;

    for (const phase of PHASES) {
      const checkpointPath = path.join(CHECKPOINT_DIR, `${phase}.json`);
      const checkpoint = loadJSON(checkpointPath);

      if (checkpoint) {
        fs.unlinkSync(checkpointPath);
        clearedCount++;
      }
    }

    logger.info(`All checkpoints cleared`, { count: clearedCount });
    return true;
  } catch (error) {
    logger.error('Failed to clear all checkpoints', { error: error.message });
    return false;
  }
};
