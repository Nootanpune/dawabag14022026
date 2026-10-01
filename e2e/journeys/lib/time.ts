// India's date (IST), as the website shows it
export const todayIST = (d = new Date()) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
