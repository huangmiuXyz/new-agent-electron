
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

export const formatTime = (timestamp: number) => {
  const date = dayjs(timestamp);
  const now = dayjs();
  const diffInHours = now.diff(date, 'hour');

  if (diffInHours < 24) {
    return date.format('HH:mm');
  } else if (diffInHours < 24 * 7) {
    return date.fromNow();
  } else {
    return date.format('MM-DD');
  }
};
