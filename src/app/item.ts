export type Item = {
  id: string;
  name: string;
  quantity: number;
  price: number;
  /** id категории из списка; '' — без категории (Firestore не принимает undefined) */
  categoryId: string;
};
