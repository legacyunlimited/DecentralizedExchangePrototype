const { expectRevert } = require('@openzeppelin/test-helpers');
const Dai = artifacts.require('mocks/Dai.sol');
const Bat = artifacts.require('mocks/Bat.sol');
const Rep = artifacts.require('mocks/Rep.sol');
const Zrx = artifacts.require('mocks/Zrx.sol');
const Dex = artifacts.require('dex.sol');
const web3 = require('web3');

const SIDE = { BUY: 0, SELL: 1 };

contract('Dex', (accounts) => {
    let dai, bat, rep, zrx, dex;
    const [trader1, trader2] = [accounts[1], accounts[2]];
    const [DAI, BAT, REP, ZRX] = ['DAI', 'BAT', 'REP', 'ZRX']
        .map(ticker => web3.utils.fromAscii(ticker));

    beforeEach(async () => {
        ([dai, bat, rep, zrx] = await Promise.all([
            Dai.new(),
            Bat.new(),
            Rep.new(),
            Zrx.new(),
        ]));
        dex = await Dex.new();
        await Promise.all([
            dex.addToken(DAI, dai.address),
            dex.addToken(BAT, bat.address),
            dex.addToken(REP, rep.address),
            dex.addToken(ZRX, zrx.address),
        ]);
        const amount = web3.utils.toWei('1000', 'ether');
        const seedTokenBalance = async (token, trader) => {
            await token.faucet(trader, amount);
            await token.approve(
                dex.address,
                amount,
                { from: trader }
            );
        }
        let traders = [trader1, trader2];
        let tokens = [dai, bat, rep, zrx];

        for (const trader of traders) {
            for (const token of tokens) {
                await seedTokenBalance(token, trader);
            }
        }
    });

    it('should deposit tokens', async () => {
        const amount = web3.utils.toWei('100', 'ether');

        await dex.deposit(
            amount,
            DAI,
            { from: trader1 }
        );

        const balance = await dex.traderBalances(trader1, DAI);
        assert(balance.toString() === amount);
    });

    it('should NOT deposit tokens if tokens do not exist', async () => {
        await expectRevert(
            dex.deposit(
                web3.utils.toWei('100', 'ether'),
                web3.utils.fromAscii('TOKEN-DOES-NOT-EXIST'),
                { from: trader1 }
            ),
            'this token does not exist'
        );
    });

    it('should withdraw tokens', async () => {
        const amount = web3.utils.toWei('100', 'ether');
        await dex.deposit(
            amount,
            DAI,
            { from: trader1 }
        );

        await dex.withdraw(
            amount,
            DAI,
            { from: trader1 }
        );

        const [balanceDex, balanceDai] = await Promise.all([
            dex.traderBalances(trader1, DAI),
            dai.balanceOf(trader1)
        ]);

        assert(balanceDex.isZero());
        assert(balanceDai.toString() === web3.utils.toWei('1000', 'ether'));
    });

    it('Should Not withdraw tokens if token does not exist', async () => {
        await expectRevert(
            dex.withdraw(
                web3.utils.toWei('100', 'ether'),
                web3.utils.fromAscii('TOKEN-DOES-NOT-EXIST'),
                { from: trader1 }
            ),
            'this token does not exist'
        );
    });

    it('should NOT withdraw tokens if the balance is too low', async () => {
        await dex.deposit(
            web3.utils.toWei('100', 'ether'),
            DAI,
            { from: trader1 }
        );

        await expectRevert(
            dex.withdraw(
                web3.utils.toWei('1000', 'ether'),
                DAI,
                { from: trader1 }
            ),
            'balance too low'
        );
    });

    it('Should create limit order', async () => {
        //console.log('Depositing for trader1');
        await dex.deposit(
            web3.utils.toWei('100', 'ether'),
            DAI,
            { from: trader1 }
        );
        //console.log('Creating limit order for trader1');    
        await dex.createLimitOrder(
            REP,
            web3.utils.toWei('10', 'ether'),
            10,
            SIDE.BUY,
            { from: trader1 }
        );

        //console.log('Fetching orders after trader1');
        let buyOrders = await dex.getOrders(REP, SIDE.BUY);
        let sellOrders = await dex.getOrders(REP, SIDE.SELL);
        assert(buyOrders.length === 1);
        assert(buyOrders[0].trader === trader1);
        assert(buyOrders[0].ticker === web3.utils.padRight(REP, 64));
        assert(buyOrders[0].price === '10');
        assert(buyOrders[0].amount === web3.utils.toWei('10', 'ether'));
        assert(sellOrders.length === 0);

        //console.log('Depositing for trader2');
        await dex.deposit(
            web3.utils.toWei('200', 'ether'),
            DAI,
            { from: trader2 }
        );
        
        //console.log('Creating limit order for trader2');
        await dex.createLimitOrder(
            REP,
            web3.utils.toWei('10', 'ether'),
            11,
            SIDE.BUY,
            { from: trader2 }
        );
        //console.log('Fetching orders after trader2 first order');

        
        buyOrders = await dex.getOrders(REP, SIDE.BUY);
        sellOrders = await dex.getOrders(REP, SIDE.SELL);
        assert(buyOrders.length === 2);
        assert(buyOrders[0].trader === trader2);   
        assert(buyOrders[1].trader === trader1); 
        assert(sellOrders.length === 0); 

        // console.log('Creating another limit order for trader2');
        await dex.createLimitOrder(
        REP,
        web3.utils.toWei('10', 'ether'),
        9,
        SIDE.BUY,
        { from: trader2 }
    );  //console.log('Fetching orders after trader2 second order');

        buyOrders = await dex.getOrders(REP, SIDE.BUY);
        sellOrders = await dex.getOrders(REP, SIDE.SELL);
        assert(buyOrders.length === 3);
        assert(buyOrders[0].trader === trader2);   
        assert(buyOrders[1].trader === trader1); 
        assert(buyOrders[2].trader === trader2);
        assert(buyOrders[2].price === '9');  
        assert(sellOrders.length === 0);       
});
it('Should not create limit order if token does not exist', async () => {
    await expectRevert(
        dex.createLimitOrder(
            web3.utils.fromAscii('TOKEN-DOES-NOT-EXIST'),
            web3.utils.toWei('1000', 'ether'),
            10,
            SIDE.BUY,
            {from: trader1}
        ),
        'this token does not exist'
    )
})
it('Should not create limit order if token is DAI', async () => {
    await expectRevert(
        dex.createLimitOrder(
            DAI,
            web3.utils.toWei('1000', 'ether'),
            10,
            SIDE.BUY,
            {from: trader1}
        ),
        'cannot trade DAI'
    )
})
it('Should not create limit order if token balance is too low', async () => {
    await dex.deposit(
        web3.utils.toWei('99', 'ether'),
        REP,
        {from: trader1}
    );

    await expectRevert(
        dex.createLimitOrder(
            REP,
            web3.utils.toWei('100', 'ether'),
            10,
            SIDE.SELL,
            {from: trader1}
        ), 
        'token balance too low'
    )
})
it('Should not create limit order if dai balance is too low', async () => {
    await dex.deposit(
        web3.utils.toWei('99', 'ether'),
        DAI,
        {from: trader1}
    );

    await expectRevert(
        dex.createLimitOrder(
            REP,
            web3.utils.toWei('10', 'ether'),
            10,
            SIDE.BUY,
            {from: trader1}
        ), 
        'dai balance too low'
    )
    });
    it('Should create a market order & match against existing limit order', async () => {
        await dex.deposit(
            web3.utils.toWei('100', 'ether'),
            DAI,
            {from: trader1}
        );
    
        await dex.createLimitOrder(
                REP,
                web3.utils.toWei('10', 'ether'),
                10,
                SIDE.BUY,
                {from: trader1}
            ),
            
        await dex.deposit(
                web3.utils.toWei('100', 'ether'),
                REP,
                {from: trader2}
        );    
        await dex.createMarketOrder(
            REP,
            web3.utils.toWei('5', 'ether'),
            SIDE.SELL,
            {from: trader2}
        )  
        
        const balances = await Promise.all([
            dex.traderBalances(trader1, DAI),
            dex.traderBalances(trader1, REP),
            dex.traderBalances(trader2, DAI),
            dex.traderBalances(trader2, REP),
        ])
        const orders = await dex.getOrders(REP, SIDE.BUY);
        assert(orders[0].filled === web3.utils.toWei('5', 'ether'));
        assert(balances[0].toString() === web3.utils.toWei('50', 'ether'));
        assert(balances[1].toString() === web3.utils.toWei('5', 'ether'));
        assert(balances[2].toString() === web3.utils.toWei('50', 'ether'));
        assert(balances[3].toString() === web3.utils.toWei('95', 'ether'));

        })
        it('Should not create market order if token does not exist', async () => {
            await expectRevert(
                dex.createMarketOrder(
                    web3.utils.fromAscii('TOKEN-DOES-NOT-EXIST'),
                    web3.utils.toWei('1000', 'ether'),
                    SIDE.BUY,
                    {from: trader1}
                ),
                'this token does not exist'
            )
        })
        it('Should not create market order if token is DAI', async () => {
            await expectRevert(
                dex.createMarketOrder(
                    DAI,
                    web3.utils.toWei('1000', 'ether'),
                    SIDE.BUY,
                    {from: trader1}
                ),
                'cannot trade DAI'
            )
        })
        it('Should not create market order if token balance is too low', async () => {
            await dex.deposit(
                web3.utils.toWei('99', 'ether'),
                REP,
                {from: trader1}
            );
        
            await expectRevert(
                dex.createMarketOrder(
                    REP,
                    web3.utils.toWei('100', 'ether'),
                    SIDE.SELL,
                    {from: trader1}
                ), 
                'token balance too low'
            )
        })
        it('Should not create market order if dai balance is too low', async () => {
            await dex.deposit(
                web3.utils.toWei('100', 'ether'),
                REP,
                {from: trader1}
            );
            await dex.createLimitOrder(
                REP,
                web3.utils.toWei('100','ether'),
                10,
                SIDE.SELL,
                {from: trader1}
            );
            await expectRevert(
                dex.createMarketOrder(
                REP,
                web3.utils.toWei('100','ether'),
                SIDE.BUY,
                {from: trader2}  
                ),
             'dai balance too low'
            )
            })
    })