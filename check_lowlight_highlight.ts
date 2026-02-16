
import { common, createLowlight } from 'lowlight';

const lowlight = createLowlight(common);

try {
  console.log('Highlighting html...');
  const result = lowlight.highlight('html', '<div>hello</div>');
  console.log('Success!');
} catch (e) {
  console.error('Failed to highlight html:', e.message);
}

try {
  console.log('Highlighting xml...');
  const result = lowlight.highlight('xml', '<div>hello</div>');
  console.log('Success!');
} catch (e) {
  console.error('Failed to highlight xml:', e.message);
}
