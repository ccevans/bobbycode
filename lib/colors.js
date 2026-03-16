// lib/colors.js
import chalk from 'chalk';

export const success = (msg) => console.log(chalk.green('✓') + ' ' + msg);
export const error = (msg) => console.error(chalk.red('Error:') + ' ' + msg);
export const warn = (msg) => console.log(chalk.yellow('⚠') + '  ' + msg);
export const info = (msg) => console.log(chalk.dim(msg));
export const bold = chalk.bold;
export const dim = chalk.dim;
