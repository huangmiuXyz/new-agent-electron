
import { common, createLowlight } from 'lowlight';
import { toHtml } from 'hast-util-to-html';

const lowlight = createLowlight(common);

try {
  console.log('Highlighting html...');
  const tree = lowlight.highlight('html', '<div>hello</div>');
  const html = toHtml(tree);
  console.log('HTML Output:', html);
} catch (e) {
  console.error('Failed to highlight html:', e);
}
