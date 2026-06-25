const args = process.argv.slice(2);
const parsedArgs = {};
let currentOption = null;

for (const arg of args) {
  const trimmed = arg.trim();
  const option = trimmed.replace(/^-+/, "");

  if (option === trimmed) {
    if (currentOption) {
      parsedArgs[currentOption] = option;
    }
    currentOption = null;
  } else {
    currentOption = option;
    parsedArgs[currentOption] = true;
  }
}

export default parsedArgs;
