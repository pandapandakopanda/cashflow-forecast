export type Transaction = {
  id:string,
  title:string,
  type: "income" | "expense",
  amountCents:number,
  date:String
}


export type NewTransaction = Omit<Transaction, "id">