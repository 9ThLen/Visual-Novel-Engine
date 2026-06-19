export const createURL = (path: string, options?: any) => {
  const scheme = options?.scheme || 'manustest';
  return `${scheme}://${path}`;
};
export const canOpenURL = async () => true;
export const openURL = async () => {};
export const addEventListener = () => ({ remove: () => {} });
export default {
  createURL,
  canOpenURL,
  openURL,
  addEventListener,
};
