'use strict';

angular.module('myApp')
    .config(['$routeProvider', function($routeProvider) {
        $routeProvider.when('/blockchain_demo', {
            templateUrl: 'blockchain_demo/view.html',
            controller: 'BlockchainController'
        });
    }])
    .controller('BlockchainController', ['$scope', 'bitcoinNetwork', function($scope, bitcoinNetwork) {
        $scope.blockchain = bitcoinNetwork.getBlockchain();
        $scope.currentBlock = bitcoinNetwork.getGenesisBlock();
        $scope.currentBlockHeight = 0;
        $scope.walletStates = [];
        $scope.nodes = bitcoinNetwork.getNodes();
        $scope.hasNoPreviousBlocks = true;
        $scope.hasNoNextBlocks = true;
        $scope.currentVisualizedHeadHeight = 0;


        $scope.initBlockchainVisualization = function() {
            $scope.cy = cytoscape({
                container: document.getElementById('cyBlockchain'),

                layout: {
                    name: 'preset',

                },

                userZoomingEnabled: false,
                userPanningEnabled: false,
                boxSelectionEnabled: false,
            });



            $scope.loadBlocks();
            $scope.cy.nodes().ungrabify();
        };

        $scope.loadBlocks = function() {
            var currentHeight = $scope.currentVisualizedHeadHeight;
            var numBlocksToLoad =   $scope.blockchain.length;//5;


            var nextXPos = 100;

            var hashToBlockchainIndex = {};

            for (var loadedBlockHeightIdx = 0; loadedBlockHeightIdx < numBlocksToLoad; loadedBlockHeightIdx++) {
                var blockIdxInChain = currentHeight + loadedBlockHeightIdx;

                if ($scope.blockchain.length > blockIdxInChain) {

                    var nextYPos = 50;

                    $scope.blockchain[blockIdxInChain].forEach(function(blockToLoad, idx){

                        var blockId = blockToLoad.hash;
                        var parentBlockId = blockToLoad.parentBlockHash;
                        hashToBlockchainIndex[blockId] = {height: blockIdxInChain, forkIdx: idx};

                        $scope.cy.add({group: 'nodes', data: {id: blockId}, position: {x: nextXPos, y: nextYPos}});

                        if(loadedBlockHeightIdx > 0) {
                            $scope.cy.add({group: 'edges', data: { source: blockId, target: parentBlockId }});
                        }

                        $scope.cy.$("#" + blockId).forEach(function (node) {
                            node.style("background-image", "./images/block.png");
                            node.style("background-fit", "contain");
                            node.style("shape", "rectangle");
                        });

                        $scope.cy.on('click', 'node', function(evt){

                            var blockchainLocationVector = hashToBlockchainIndex[this.id()];

                            $scope.currentBlock = $scope.blockchain[blockchainLocationVector.height][blockchainLocationVector.forkIdx];
                            $scope.setWalletsState($scope.currentBlock);
                            $scope.currentBlockHeight =  blockchainLocationVector.height;
                            $scope.$apply();
                        });

                        nextYPos += 100;
                    });

                    nextXPos += 200;
                }
            }

            $scope.currentVisualizedBlockHeadIdx += loadedBlockHeightIdx;
        };

        $scope.getBlockReward = function(block) {
            var reward = ($scope.isGensisBlock(block)) ? 0 : 10;
            block.transactions.forEach(function(transaction) {
                reward += transaction.fee;
            });


            return reward;
        };

        $scope.getPreviousBlockHash = function(block) {
            var blockIdx = block.height;
            var prevHash = "Gensis Block hat keine Vorgänger";

            if(!$scope.isGensisBlock(block)) {
                prevHash = block.parentBlockHash;
            }

            return prevHash;
        };

        $scope.isGensisBlock = function(block) {
            return $scope.currentBlockHeight === 0;
        };

        $scope.setWalletsState = function(block) {

            var blockIdx = $scope.currentBlockHeight;
            //get chain
            var chainToBlock = [block];

            var currentHeight = blockIdx;
            for(currentHeight; currentHeight > 0; currentHeight--) {
                var prevBlock = $scope.blockchain[currentHeight].find(function (parentBlock) {
                    return parentBlock.hash === chainToBlock[0].parentBlockHash;
                });
                if(prevBlock !== undefined)
                    chainToBlock.unshift(prevBlock);
            }
            chainToBlock.pop();

            $scope.walletStates = [];
            $scope.nodes.forEach(function (node) {
                $scope.walletStates[node.address-1] = {address: node.address, balance: 0, utxos: [], receivedUtxos: [], spentUtxos: []};
            });



            if(blockIdx == 0) {


                block.transactions.forEach(function (transaction) {
                    var toWalletAddress = transaction.to-1;
                    transaction.utxos.forEach(function(utxo) {
                        $scope.walletStates[toWalletAddress].receivedUtxos.push(utxo.amount);
                    });
                });
            }

            //iterate over chain aggregate
            if (blockIdx > 0) {

                var genesisBlock = bitcoinNetwork.getGenesisBlock();
                genesisBlock.transactions.forEach(function(transaction){
                    var toWalletAddress = transaction.to-1;
                    transaction.utxos.forEach(function (utxo) {
                        $scope.walletStates[toWalletAddress].utxos.push(utxo.amount);
                    });
                });

                chainToBlock.forEach(function(prevBlock) {
                    prevBlock.transactions.forEach(function (transaction) {
                        var toWalletAddress = transaction.to-1;
                        var fromWalletAddress = transaction.from;




                        if(fromWalletAddress > 0) {
                            transaction.utxos.forEach(function (transactionUtxo) {
                                var idx = $scope.walletStates[fromWalletAddress-1].utxos.findIndex(function(curUtxo) {
                                    return transactionUtxo.amount === curUtxo;
                                });

                                if(idx !== -1){
                                    $scope.walletStates[fromWalletAddress-1].utxos.splice(idx, 1);
                                }
                            });

                            if(transaction.change > 0)
                                $scope.walletStates[fromWalletAddress-1].utxos.push(transaction.change);
                        }

                        $scope.walletStates[toWalletAddress].utxos.push(transaction.amount);
                    });

                });

                block.transactions.forEach(function (transaction) {
                    var toWalletAddress = transaction.to-1;
                    var fromWalletAddress = transaction.from;

                    if(fromWalletAddress > 0) {
                        $scope.walletStates[fromWalletAddress-1].spentUtxos = $scope.walletStates[fromWalletAddress-1].spentUtxos.concat(transaction.utxos);
                        if(transaction.change > 0)
                            $scope.walletStates[fromWalletAddress-1].receivedUtxos.push(transaction.change);
                    }

                    $scope.walletStates[toWalletAddress].receivedUtxos.push(transaction.amount);
                });
            }

            $scope.walletStates.forEach(function (wallet) {
                wallet.balance = 0;
                wallet.utxos.forEach(function (utxo) {
                    wallet.balance += utxo;
                });

                wallet.receivedUtxos.forEach(function (utxo) {
                    wallet.balance += utxo;
                });
            });
        };

        $scope.setWalletsState($scope.currentBlock);
        $scope.initBlockchainVisualization();
    }]);