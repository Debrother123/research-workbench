"""Tiny analytical gradient update. No external package or data required."""
from model import AssociationModel, binary_loss


def smoke():
    model = AssociationModel()
    nodes, protein, label = [[1., 0.], [0., 1.]], [0.2, 0.8], 1
    p, features = model.forward(nodes, protein)
    before = binary_loss(p, label)
    # Analytical derivative of sigmoid + binary cross entropy.
    model.weights = [w - 0.1 * (p - label) * x
                     for w, x in zip(model.weights, features)]
    after = binary_loss(model.forward(nodes, protein)[0], label)
    assert after < before
    print({'fixture': 'synthetic', 'loss_before': before, 'loss_after': after})


if __name__ == '__main__':
    smoke()
