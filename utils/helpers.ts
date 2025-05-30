
export const generateId = (): string => Math.random().toString(36).substr(2, 9);

export const dateReviver = (key: string, value: any): any => {
  if ((key === 'createdAt' || key === 'timestamp' || key === 'deletedAt') && typeof value === 'string') {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  return value;
};
