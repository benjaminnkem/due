extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env,
};

const TEN: i128 = 100_000_000;

struct Ctx<'a> {
    env: Env,
    client: DueClient<'a>,
    token: Address,
    recipient: Address,
    payer: Address,
}

fn reference(env: &Env) -> BytesN<32> {
    let mut b = [0u8; 32];
    b[..10].copy_from_slice(b"invoice 18");
    BytesN::from_array(env, &b)
}

fn setup<'a>() -> Ctx<'a> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);
    let issuer = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(issuer).address();
    let recipient = Address::generate(&env);
    let payer = Address::generate(&env);
    StellarAssetClient::new(&env, &token).mint(&payer, &(TEN * 5));
    let id = env.register(Due, ());
    let client = DueClient::new(&env, &id);
    Ctx { env, client, token, recipient, payer }
}

fn open(c: &Ctx) -> u32 {
    c.client
        .open(&c.recipient, &c.token, &TEN, &2_000, &reference(&c.env))
}

#[test]
fn open_stores_and_increments() {
    let c = setup();
    assert_eq!(open(&c), 1);
    assert_eq!(open(&c), 2);
    let d = c.client.get(&1);
    assert_eq!(d.status, Status::Open);
    assert_eq!(d.amount, TEN);
    assert_eq!(d.payer, None);
    assert_eq!(d.recipient, c.recipient);
}

#[test]
fn open_rejects_zero_amount() {
    let c = setup();
    let r = c
        .client
        .try_open(&c.recipient, &c.token, &0, &2_000, &reference(&c.env));
    assert_eq!(r, Err(Ok(Error::BadAmount)));
}

#[test]
fn open_rejects_past_deadline() {
    let c = setup();
    let r = c
        .client
        .try_open(&c.recipient, &c.token, &TEN, &1_000, &reference(&c.env));
    assert_eq!(r, Err(Ok(Error::DeadlinePast)));
}

#[test]
fn open_requires_recipient_auth() {
    let c = setup();
    open(&c);
    let auths = c.env.auths();
    assert_eq!(auths[0].0, c.recipient);
}

#[test]
fn pay_moves_exact_amount_and_contract_holds_nothing() {
    let c = setup();
    let id = open(&c);
    c.client.pay(&c.payer, &id, &c.token, &TEN);
    let t = TokenClient::new(&c.env, &c.token);
    assert_eq!(t.balance(&c.recipient), TEN);
    assert_eq!(t.balance(&c.payer), TEN * 4);
    assert_eq!(t.balance(&c.client.address), 0);
}

#[test]
fn pay_stores_payer_and_status() {
    let c = setup();
    let id = open(&c);
    c.client.pay(&c.payer, &id, &c.token, &TEN);
    let d = c.client.get(&id);
    assert_eq!(d.status, Status::Paid);
    assert_eq!(d.payer, Some(c.payer.clone()));
}

#[test]
fn pay_twice_fails() {
    let c = setup();
    let id = open(&c);
    c.client.pay(&c.payer, &id, &c.token, &TEN);
    let r = c.client.try_pay(&c.payer, &id, &c.token, &TEN);
    assert_eq!(r, Err(Ok(Error::NotOpen)));
}

#[test]
fn pay_wrong_amount_fails_without_moving_tokens() {
    let c = setup();
    let id = open(&c);
    let r = c.client.try_pay(&c.payer, &id, &c.token, &(TEN - 10_000_000));
    assert_eq!(r, Err(Ok(Error::WrongAmount)));
    let t = TokenClient::new(&c.env, &c.token);
    assert_eq!(t.balance(&c.recipient), 0);
    assert_eq!(t.balance(&c.payer), TEN * 5);
    assert_eq!(c.client.get(&id).status, Status::Open);
}

#[test]
fn pay_wrong_token_fails() {
    let c = setup();
    let id = open(&c);
    let other = Address::generate(&c.env);
    let r = c.client.try_pay(&c.payer, &id, &other, &TEN);
    assert_eq!(r, Err(Ok(Error::WrongToken)));
}

#[test]
fn pay_after_deadline_fails() {
    let c = setup();
    let id = open(&c);
    c.env.ledger().set_timestamp(2_001);
    let r = c.client.try_pay(&c.payer, &id, &c.token, &TEN);
    assert_eq!(r, Err(Ok(Error::DeadlinePast)));
}

#[test]
fn close_before_deadline_fails() {
    let c = setup();
    let id = open(&c);
    assert_eq!(c.client.try_close(&id), Err(Ok(Error::StillOpen)));
}

#[test]
fn close_after_deadline_sets_closed() {
    let c = setup();
    let id = open(&c);
    c.env.ledger().set_timestamp(2_001);
    c.client.close(&id);
    assert_eq!(c.client.get(&id).status, Status::Closed);
}

#[test]
fn close_paid_due_fails() {
    let c = setup();
    let id = open(&c);
    c.client.pay(&c.payer, &id, &c.token, &TEN);
    c.env.ledger().set_timestamp(2_001);
    assert_eq!(c.client.try_close(&id), Err(Ok(Error::NotOpen)));
}

#[test]
fn get_missing_fails() {
    let c = setup();
    assert_eq!(c.client.try_get(&99), Err(Ok(Error::NotFound)));
}
