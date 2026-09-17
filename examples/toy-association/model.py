"""Synthetic teaching fixture, not a paper reproduction or biological finding.

Pure Python linear pair scorer; intentionally small for parser and runtime checks.
"""
import math


class MeanPool:
    def forward(self, nodes):
        return [sum(col) / len(nodes) for col in zip(*nodes)]


class PairEncoder:
    def __init__(self):
        self.pool = MeanPool()

    def forward(self, drug_nodes, protein_features):
        drug = self.pool.forward(drug_nodes)
        return drug + protein_features


class AssociationModel:
    def __init__(self):
        self.encoder = PairEncoder()
        self.weights = [0.1, -0.2, 0.3, 0.2]

    def forward(self, drug_nodes, protein_features):
        features = self.encoder.forward(drug_nodes, protein_features)
        logit = sum(w * x for w, x in zip(self.weights, features))
        return 1 / (1 + math.exp(-logit)), features


def binary_loss(probability, label):
    p = min(max(probability, 1e-8), 1 - 1e-8)
    return -label * math.log(p) - (1 - label) * math.log(1 - p)
