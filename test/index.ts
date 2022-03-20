import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import { MultiSigWallet } from '../typechain';

describe('MultiSigWallet', function () {
    // Number of minimum signatories required to execute/confirm a transaction
    const SIGNATORIES_REQUIRED_TO_CONFIRM = 2;
    let funder: SignerWithAddress;
    let signatories: SignerWithAddress[];
    let multiSigWallet: MultiSigWallet;
    let recipient: SignerWithAddress;
    let nonSignatory: SignerWithAddress;

    before(async () => {
        // get 3 signatories
        [funder, recipient, nonSignatory, ...signatories] =
            await ethers.getSigners();

        // deploy multi wallet contract
        const MultiSigWalletFactory = await ethers.getContractFactory(
            'MultiSigWallet',
        );
        multiSigWallet = await MultiSigWalletFactory.deploy(
            [
                signatories[0].address,
                signatories[1].address,
                signatories[2].address,
            ],
            SIGNATORIES_REQUIRED_TO_CONFIRM,
        );
    });

    describe('Setting up', () => {
        it('Check signatories addresses', async function () {
            expect(await multiSigWallet.isOwner(signatories[0].address)).to.be
                .true;
            expect(await multiSigWallet.isOwner(signatories[1].address)).to.be
                .true;
            expect(await multiSigWallet.isOwner(signatories[2].address)).to.be
                .true;
        });
        it('no of minimum signatories should equal 2', async () => {
            expect(await multiSigWallet.numConfirmationsRequired()).equal(
                ethers.BigNumber.from(2),
            );
        });
        it('send 10 ether to the wallet', async () => {
            const tenEth = ethers.utils.parseEther('10');
            // send 1 ETH to wallet
            const tx = await multiSigWallet.connect(funder).deposit({
                from: funder.address,
                value: tenEth,
            });
            expect(tx).to.emit(multiSigWallet, 'Deposit').withArgs(
                funder.address,
                tenEth, // value
                tenEth, // balance
            );
        });
    });

    context(
        'Submit, Confirm and Execute a Transaction without a contract',
        () => {
            // transaction index
            const txIndex = ethers.BigNumber.from(0);
            const oneEth = ethers.utils.parseEther('1');

            let recipientOldBalance: BigNumber;

            describe('submit a transaction', () => {
                it('SubmitTransaction should be emitted', async () => {
                    recipientOldBalance = await recipient.getBalance();
                    const tx = await multiSigWallet
                        .connect(signatories[0])
                        .submitTransaction(recipient.address, oneEth, '0x');
                    expect(tx)
                        .to.emit(multiSigWallet, 'SubmitTransaction')
                        .withArgs(
                            signatories[0].address, // msg.sender
                            ethers.BigNumber.from(0), // transaction index
                            recipient.address, // to
                            oneEth, // value
                            '0x', //data
                        );
                });
                it('transaction count equal to 1', async () => {
                    const txCount = await multiSigWallet.getTransactionCount();
                    expect(txCount).equal(ethers.BigNumber.from(1));
                });
                it('getTransaction should return the transaction', async () => {
                    const tx = await multiSigWallet.getTransaction(txIndex);
                    expect(tx[0]).equal(recipient.address); // to
                    expect(tx[1]).equal(oneEth); // value
                    expect(tx[2]).equal('0x'); // data
                    expect(tx[3]).equal(false); // executed = false = not yet executed
                    expect(tx[4]).equal(ethers.BigNumber.from(0)); // numConfirmations = 0 since just submitted
                });
            });

            describe('confirm a transaction', () => {
                it('ConfirmTransaction should be emitted', async () => {
                    const tx = await multiSigWallet
                        .connect(signatories[0])
                        .confirmTransaction(txIndex);

                    expect(tx)
                        .to.emit(multiSigWallet, 'ConfirmTransaction')
                        .withArgs(
                            signatories[0].address, // msg.sender
                            txIndex, // transacion index
                        );
                });

                it('executeTransaction should be reverted when there is only one confirmation', async () => {
                    await expect(
                        multiSigWallet
                            .connect(signatories[0])
                            .executeTransaction(txIndex),
                    ).to.be.revertedWith('cannot execute tx');
                });

                it('second signatory confirm transaction and no confirmations equal 2', async () => {
                    const tx = await multiSigWallet
                        .connect(signatories[1])
                        .confirmTransaction(txIndex);
                    expect(tx)
                        .to.emit(multiSigWallet, 'ConfirmTransaction')
                        .withArgs(
                            signatories[1].address, // msg.sender
                            txIndex, // transacion index
                        );

                    const transaction = await multiSigWallet.getTransaction(
                        txIndex,
                    );
                    expect(transaction[4]).equal(ethers.BigNumber.from(2));
                });
            });

            describe('execute a transaction', () => {
                it('should emit ExecuteTransaction', async () => {
                    const tx = await multiSigWallet
                        .connect(signatories[0])
                        .executeTransaction(txIndex);
                    expect(tx)
                        .to.emit(multiSigWallet, 'ExecuteTransaction')
                        .withArgs(signatories[0].address, txIndex);
                });
                it('balance recipient should increased', async () => {
                    const updatedBalance = await recipient.getBalance();
                    expect(updatedBalance).gt(recipientOldBalance);
                });
            });
        },
    );

    context('Submit, Revoke confirmation of a Transaction', () => {
        const txIndex = ethers.BigNumber.from(1);
        const nineEther = ethers.utils.parseEther('9');
        describe('submit a new transaction', () => {
            it('SubmitTransaction should be emitted', async () => {
                const tx = await multiSigWallet
                    .connect(signatories[0])
                    .submitTransaction(recipient.address, nineEther, '0x');
                expect(tx)
                    .to.be.emit(multiSigWallet, 'SubmitTransaction')
                    .withArgs(
                        signatories[0].address, // msg.sender
                        txIndex, // trnsaction index
                        recipient.address, // to
                        nineEther, // value
                        '0x', // data
                    );
            });
            it('transaction count equal 2', async () => {
                expect(await multiSigWallet.getTransactionCount()).equal(
                    ethers.BigNumber.from(2),
                );
            });
        });

        describe('confirm twice', () => {
            it('the transaction should have 2 confirmations', async () => {
                // first signatory confirm the transaction
                await multiSigWallet
                    .connect(signatories[0])
                    .confirmTransaction(txIndex);
                // second signatory confirm the transaction
                await multiSigWallet
                    .connect(signatories[1])
                    .confirmTransaction(txIndex);

                const transaction = await multiSigWallet.getTransaction(
                    txIndex,
                );

                expect(transaction[4]).equal(ethers.BigNumber.from(2));
            });
        });

        describe('Revoke the transaction', () => {
            it('the numConfirmation of the transaction decreases and equal to 1', async () => {
                // second signatory revoke a confirmation of the transaction
                const tx = await multiSigWallet
                    .connect(signatories[1])
                    .revokeConfirmation(txIndex);
                expect(tx)
                    .to.emit(multiSigWallet, 'RevokeConfirmation')
                    .withArgs(signatories[1].address, txIndex);

                const transaction = await multiSigWallet.getTransaction(
                    txIndex,
                );
                expect(transaction[4]).equal(ethers.BigNumber.from(1));
            });
            it('non-signatory cannot revoke confirmation of a transaction', async () => {
                // nonSignatory who is not one of the signatories!
                await expect(
                    multiSigWallet
                        .connect(nonSignatory)
                        .revokeConfirmation(txIndex),
                ).to.be.revertedWith('not owner');
            });
            it('executeTransaction will be reverted when numConfirmation is 1', async () => {
                await expect(
                    multiSigWallet
                        .connect(signatories[0])
                        .executeTransaction(txIndex),
                ).to.be.revertedWith('cannot execute tx');
            });
        });

        describe('Re-confirm the transaction and execute', () => {
            it('numConfirmation is now back to 2', async () => {
                // confirm by the third owner/signatory
                await multiSigWallet
                    .connect(signatories[2])
                    .confirmTransaction(txIndex);
                const transaction = await multiSigWallet.getTransaction(
                    txIndex,
                );
                expect(transaction[4]).equal(ethers.BigNumber.from(2));
            });
            it('executeTransaction emit ExecuteTransaction event', async () => {
                await multiSigWallet
                    .connect(signatories[0])
                    .executeTransaction(txIndex);
            });
            it('executeTransaction should be reverted if transaction already executed', async () => {
                await expect(
                    multiSigWallet
                        .connect(signatories[0])
                        .executeTransaction(txIndex),
                ).to.be.revertedWith('tx already executed');
            });
        });
    });
});
