# Animals

Edit this table; the game's animal roster will be built from it. One row per
species. Delete the example rows and add your own.

- **Chance** is the relative probability that a spawn produces this species.
  The numbers do not have to add up to 100; they are weights.
- **Max Alive** is the maximum amount of animals that can spawn at one time
- **Look** is a short description used to draw the 16 × 16 one-bit sprite
  (black with a white halo, like the outlaw, dog and cat were).
- **Behaviour** is the on-screen behaviour like speed, whether it flees, other behaviour
- **Catchable** means whether it can be caught with a drop Net, butterflies can only be caught with a butterfly net
- **Shootable** means whether it can be shot with the laser gun and how many shots it takes to kill. Behaviour after kill in Behaviour column.
- **Reward** means whether there is a reward for killing a creature, which will arrive in inventory

| Animal    | Chance | # Alive | Look                                              | Behaviour                                                                                           | Catchable (Net) | Shootable (Laser Gun) | Reward |
|-----------|--------|---------|---------------------------------------------------|-----------------------------------------------------------------------------------------------------|-----------------|-----------------------|--------|
| Bee       | 100    | 20      | Extremely small                                   | Buzzing around in one group near a tree, flying                                                     | No              | No                    | No     |
| Rabbit    | 100    | 3       | small, long ears, round tail                      | fast, wanders                                                                                       | No              | Yes, 1 shot kill      | No     |
| Rooster   | 100    | 2       | small                                             | small, slow, they gather together occasionally and then wander around the mining farm               | No              | No                    | No     |
| Hen       | 100    | 8       | small                                             | small, slow, they gather together occasionally and then wander around the mining farm               | No              | No                    | No     |
| Cat       | 100    | 2       | small, ears, long tail, furry                     | medium speed, walks to Friend occasionally then runs away                                           | No              | No                    | No     |
| Dog       | 100    | 1       | medium size, ears, short tail                     | medium speed, walks to Friend when nearby, roams around                                             | No              | No                    | No     |
| Deer      | 100    | 6       | tall, antlers, slim legs                          | slow, pauses often, herd together, fall over when shot                                              | No              | Yes, 1 shot kill      | No     |
| Cow       | 100    | 5       | big, cattle                                       | slow, pauses often, herd together, fall over when shot                                              | No              | Yes, 1 shot kill      | No     | 
| Pig       | 100    | 4       | medium size, round, curly tail, snout             | slow, pauses often, herd together, fall over when shot, around and in puddle near mining farm       | No              | Yes, 1 shot kill      | No     |
| Bird      | 100    | 8       | Small, wings, flying, random colors               | fast, wanders                                                                                       | No              | No                    | No     |
| Crow      | 100    | 4       | Wings, flying, jet black, a bit larger than a bird | fast, wanders                                                                                       | No              | No                    | No     |
| Frog      | 100    | 8       | Small, random colors                              | slow, hops, wanders                                                                                 | No              | No                    | No     |
| Ostrich   | 100    | 1       | Big,slim legs, long slim neck                     | Bends neck into ground when approached                                                              | No              | Yes, 1 shot kill      | No     |
| Snake     | 100    | 3       | small, thin, long, gradually tapered, oveal head  | Slithers around                                                                                     | No              | Yes, 1 shot kill      | No     |
| Butterfly | 100    | 5       | Very small, slim body, large wings, random colors | slow, flutters around, can only be caught by butterfly net                                          | Yes             | No                    | No     |
| Lion      | 5      | 1       | Big, slender, manes, furry tail, yellowish        | fast, runs away, fall over when shot 2 times                                                        | No              | Yes, 2 shot kill      | 2 RF   |
| Bear      | 5      | 1       | Big, stout, heavy, furry, brownish                | fast, runs away, fall over when shot 2 times                                                        | No              | Yes, 2 shot kill      | 2 RF   |
| Golden Fox | 0      | 1       | bushy tail, pointed ears, golden colour           | quick, keeps away from the Friend                                                                   | No              | No                    | No     |
| Dragon    | 0      | 1       | Big, Flying, spiked back and tail, fire-breathing | quick, will descend fast upon the Friend, firebreath and fly away again, explodes when shot 2 times | No              | Yes, 3 shot kill      | 5 RF   |

## Population

| Setting                               | Value      |
|---------------------------------------|------------|
| Respawn delay after a catch (seconds) | no respawn |
| Respawn delay after a kill (seconds)  | 1 minute   |
| Animals also spawn inside buildings   | no         |
