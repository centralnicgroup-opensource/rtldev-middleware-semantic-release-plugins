import execa from "execa";

export function exec(file, options) {
  const childProcess = execa(file, options);
  childProcess.stdout?.pipe(process.stdout);
  childProcess.stderr?.pipe(process.stderr);
  return childProcess;
}
