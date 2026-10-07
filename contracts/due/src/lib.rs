#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, BytesN,
    Env,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotFound = 1,
    BadAmount = 2,
    DeadlinePast = 3,
    NotOpen = 4,
    WrongAmount = 5,
    WrongToken = 6,
    StillOpen = 7,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Status {
    Open = 0,
    Paid = 1,
    Closed = 2,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DueRecord {
    pub id: u32,
    pub recipient: Address,
    pub token: Address,
    pub amount: i128,
    pub deadline: u64,
    pub reference: BytesN<32>,
    pub status: Status,
    pub payer: Option<Address>,
}

#[contracttype]
enum Key {
    NextId,
    Due(u32),
}

#[contractevent]
pub struct DueOpened {
    #[topic]
    pub id: u32,
    pub recipient: Address,
    pub token: Address,
    pub amount: i128,
    pub deadline: u64,
    pub reference: BytesN<32>,
}

#[contractevent]
pub struct DuePaid {
    #[topic]
    pub id: u32,
    pub payer: Address,
    pub amount: i128,
}

#[contractevent]
pub struct DueClosed {
    #[topic]
    pub id: u32,
}

#[contract]
pub struct Due;

fn load(env: &Env, id: u32) -> Result<DueRecord, Error> {
    env.storage()
        .instance()
        .get(&Key::Due(id))
        .ok_or(Error::NotFound)
}

#[contractimpl]
impl Due {
    pub fn open(
        env: Env,
        recipient: Address,
        token: Address,
        amount: i128,
        deadline: u64,
        reference: BytesN<32>,
    ) -> Result<u32, Error> {
        recipient.require_auth();
        if amount <= 0 {
            return Err(Error::BadAmount);
        }
        if deadline <= env.ledger().timestamp() {
            return Err(Error::DeadlinePast);
        }
        let id: u32 = env.storage().instance().get(&Key::NextId).unwrap_or(1);
        let due = DueRecord {
            id,
            recipient: recipient.clone(),
            token: token.clone(),
            amount,
            deadline,
            reference: reference.clone(),
            status: Status::Open,
            payer: None,
        };
        env.storage().instance().set(&Key::Due(id), &due);
        env.storage().instance().set(&Key::NextId, &(id + 1));
        DueOpened { id, recipient, token, amount, deadline, reference }.publish(&env);
        Ok(id)
    }

    pub fn pay(
        env: Env,
        payer: Address,
        id: u32,
        token: Address,
        amount: i128,
    ) -> Result<(), Error> {
        payer.require_auth();
        let mut due = load(&env, id)?;
        if due.status != Status::Open {
            return Err(Error::NotOpen);
        }
        if env.ledger().timestamp() > due.deadline {
            return Err(Error::DeadlinePast);
        }
        if token != due.token {
            return Err(Error::WrongToken);
        }
        if amount != due.amount {
            return Err(Error::WrongAmount);
        }
        token::Client::new(&env, &due.token).transfer(&payer, &due.recipient, &amount);
        due.status = Status::Paid;
        due.payer = Some(payer.clone());
        env.storage().instance().set(&Key::Due(id), &due);
        DuePaid { id, payer, amount }.publish(&env);
        Ok(())
    }

    pub fn close(env: Env, id: u32) -> Result<(), Error> {
        let mut due = load(&env, id)?;
        if due.status != Status::Open {
            return Err(Error::NotOpen);
        }
        if env.ledger().timestamp() <= due.deadline {
            return Err(Error::StillOpen);
        }
        due.status = Status::Closed;
        env.storage().instance().set(&Key::Due(id), &due);
        DueClosed { id }.publish(&env);
        Ok(())
    }

    pub fn get(env: Env, id: u32) -> Result<DueRecord, Error> {
        load(&env, id)
    }
}

#[cfg(test)]
mod test;
